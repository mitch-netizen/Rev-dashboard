import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "./constants";
import { ensureWeekTargetsSeeded, fetchAreas, type Area } from "./targets";

export interface RecoveryDay {
  dayOfWeek: number;
  date: string;
  label: string;
}

export interface RecoveryRow {
  area: Area;
  weeklyTarget: number;
  accruedTarget: number | null;
  accruedActual: number | null;
  variance: number | null;
  remainingDaysCount: number;
  normalRemainingDailyAvg: number | null;
  catchUpPerDay: number;
  requiredDailyAvgRemaining: number | null;
  isBehind: boolean;
}

// A group's member lines (e.g. Main Bar Liquor under All Bars) have no target
// of their own — only the group does — so they carry just an actual figure,
// not a full RecoveryRow's target/variance/catch-up columns.
export interface RecoveryMemberRow {
  area: Area;
  accruedActual: number | null;
}

export interface RecoveryGroup {
  row: RecoveryRow;
  members: RecoveryMemberRow[];
}

// Either a standalone targeted line (Gaming Turnover, Accommodation Occupancy)
// or a group with its member lines nested underneath, ordered by where the
// underlying revenue lines actually sit so the page reads top-to-bottom the
// same way the Current Week grid does.
export type RecoverySection =
  | { kind: "standalone"; row: RecoveryRow }
  | { kind: "group"; group: RecoveryGroup };

export interface RecoveryReport {
  monday: Date;
  mondayIso: string;
  days: RecoveryDay[];
  isCurrentWeek: boolean;
  hasAnyTargets: boolean;
  sections: RecoverySection[];
  // Lines with no target at all and no group membership (e.g. Gaming Revenue) —
  // kept separate so they never masquerade as an on/ahead-of-target line.
  ungroupedRows: RecoveryMemberRow[];
  remainingDaysCount: number;
}

// Shared by the /recovery page and its Excel export so the two can never
// drift apart on what "behind" means. Today's trade isn't closed out yet
// (its actual doesn't land until tomorrow's report), so it's treated as
// part of what's still to be made up, not as a completed day already
// judged against target.
export async function computeRecoveryReport(
  supabase: SupabaseClient,
  weekParam?: string
): Promise<RecoveryReport> {
  const today = venueNow();
  const requestedMonday =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? new Date(`${weekParam}T00:00:00Z`) : today;
  const monday = mondayOf(requestedMonday);
  const thisWeekMonday = mondayOf(today);
  const isCurrentWeek = toIsoDate(monday) === toIsoDate(thisWeekMonday);
  const todayIso = toIsoDate(today);
  const mondayIso = toIsoDate(monday);

  const days: RecoveryDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return {
      dayOfWeek: i,
      date: toIsoDate(d),
      label: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    };
  });

  const weekId = await ensureWeekTargetsSeeded(supabase, mondayIso);
  const areas = await fetchAreas(supabase);

  const [{ data: weeklyTargetRows }, { data: actualRows }] = await Promise.all([
    weekId
      ? supabase.from("rev_weekly_targets").select("revenue_line_id, group_id, day_of_week, amount").eq("week_id", weekId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("rev_daily_actuals")
      .select("trade_date, revenue_line_id, value")
      .eq("venue_id", VENUE_ID)
      .gte("trade_date", days[0].date)
      .lte("trade_date", days[6].date),
  ]);

  const targetsByAreaDay = new Map<string, Map<number, number>>();
  for (const row of weeklyTargetRows ?? []) {
    const areaId = (row.revenue_line_id ?? row.group_id) as string;
    if (!targetsByAreaDay.has(areaId)) targetsByAreaDay.set(areaId, new Map());
    targetsByAreaDay.get(areaId)!.set(row.day_of_week, Number(row.amount));
  }

  const actualsByLineDate = new Map<string, Map<string, number>>();
  for (const row of actualRows ?? []) {
    if (!actualsByLineDate.has(row.revenue_line_id)) actualsByLineDate.set(row.revenue_line_id, new Map());
    actualsByLineDate.get(row.revenue_line_id)!.set(row.trade_date, Number(row.value));
  }

  const hasAnyTargets = (weeklyTargetRows ?? []).length > 0;

  const elapsedDays = days.filter((d) => d.date < todayIso);
  const remainingDays = days.filter((d) => d.date >= todayIso);

  function targetFor(areaId: string, dayOfWeek: number) {
    return targetsByAreaDay.get(areaId)?.get(dayOfWeek) ?? 0;
  }

  function actualFor(memberLineIds: string[], date: string) {
    let total = 0;
    let hasValue = false;
    for (const lineId of memberLineIds) {
      const v = actualsByLineDate.get(lineId)?.get(date);
      if (v !== undefined) {
        total += v;
        hasValue = true;
      }
    }
    return { total, hasValue };
  }

  function computeRow(area: Area): RecoveryRow {
    const sumTarget = (set: RecoveryDay[]) => set.reduce((acc, d) => acc + targetFor(area.id, d.dayOfWeek), 0);
    const sumActual = (set: RecoveryDay[]) =>
      set.reduce((acc, d) => {
        const { total, hasValue } = actualFor(area.memberLineIds, d.date);
        return hasValue ? acc + total : acc;
      }, 0);
    const countWithActual = (set: RecoveryDay[]) =>
      set.filter((d) => actualFor(area.memberLineIds, d.date).hasValue).length;

    const weeklyTargetTotal = sumTarget(days);
    const accruedTargetToDate = sumTarget(elapsedDays);
    const accruedActualToDate = sumActual(elapsedDays);
    const remainingTargetNormal = sumTarget(remainingDays);
    const varianceToDate = accruedActualToDate - accruedTargetToDate;
    const shortfall = Math.max(0, -varianceToDate);
    const remainingDaysCount = remainingDays.length;
    const catchUpPerDay = remainingDaysCount > 0 ? shortfall / remainingDaysCount : 0;
    const requiredDailyAvgRemaining =
      remainingDaysCount > 0 ? (remainingTargetNormal + shortfall) / remainingDaysCount : null;
    const normalRemainingDailyAvg = remainingDaysCount > 0 ? remainingTargetNormal / remainingDaysCount : null;

    const displayDivisorWeek = area.isAveraged ? 7 : 1;
    const elapsedCountWithData = area.isAveraged ? countWithActual(elapsedDays) : elapsedDays.length;
    const displayDivisorElapsed = area.isAveraged ? Math.max(elapsedCountWithData, 1) : 1;

    return {
      area,
      weeklyTarget: weeklyTargetTotal / displayDivisorWeek,
      accruedTarget: elapsedDays.length > 0 ? accruedTargetToDate / (area.isAveraged ? elapsedDays.length : 1) : null,
      accruedActual:
        elapsedDays.length > 0 && (!area.isAveraged || elapsedCountWithData > 0)
          ? accruedActualToDate / displayDivisorElapsed
          : null,
      variance:
        elapsedDays.length > 0 ? varianceToDate / (area.isAveraged ? Math.max(elapsedCountWithData, 1) : 1) : null,
      remainingDaysCount,
      normalRemainingDailyAvg,
      catchUpPerDay,
      requiredDailyAvgRemaining,
      isBehind: varianceToDate < -0.005,
    };
  }

  // Only Gaming Turnover, Accommodation Occupancy and the three groups (All
  // Bars / All Food / Retail) carry an actual target — everything else is
  // either a group member (rolled into its group's total) or untargeted.
  const groupAreas = areas.filter((a) => a.kind === "group");
  const groupMemberIds = new Set(groupAreas.flatMap((g) => g.memberLineIds));
  const lineAreas = areas.filter((a) => a.kind === "line");

  const standaloneRows = lineAreas
    .filter((a) => !groupMemberIds.has(a.id) && targetsByAreaDay.has(a.id))
    .map(computeRow);

  const groups: RecoveryGroup[] = groupAreas.map((group) => ({
    row: computeRow(group),
    members: lineAreas
      .filter((l) => group.memberLineIds.includes(l.id))
      .map((l) => ({ area: l, accruedActual: computeRow(l).accruedActual })),
  }));

  const ungroupedRows = lineAreas
    .filter((a) => !groupMemberIds.has(a.id) && !targetsByAreaDay.has(a.id))
    .map((a) => ({ area: a, accruedActual: computeRow(a).accruedActual }));

  // Slot each group in among the standalone lines by where its member lines
  // actually sit (its lowest display order), so the page reads in the same
  // top-to-bottom order as the Current Week grid instead of grouping
  // everything with a target above everything without one.
  const orderedSections = [
    ...standaloneRows.map((row) => ({ sortKey: row.area.displayOrder, section: { kind: "standalone" as const, row } })),
    ...groups.map((group) => ({
      sortKey: Math.min(...group.members.map((m) => m.area.displayOrder)),
      section: { kind: "group" as const, group },
    })),
  ].sort((a, b) => a.sortKey - b.sortKey);
  const sections: RecoverySection[] = orderedSections.map((s) => s.section);

  return {
    monday,
    mondayIso,
    days,
    isCurrentWeek,
    hasAnyTargets,
    sections,
    ungroupedRows,
    remainingDaysCount: remainingDays.length,
  };
}
