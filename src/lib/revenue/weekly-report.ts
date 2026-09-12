import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "./constants";
import { ensureWeekTargetsSeeded, fetchAreas, type Area } from "./targets";

// The five headline areas the printed report leads with, in display order —
// two individual lines plus the three group targets. There's no schema flag
// for "headline"; these keys are the ones the venue actually reports on.
const HEADLINE_KEYS = ["gaming_turnover", "all_bars", "all_food", "retail", "accommodation_occupancy"];

export interface WeeklyReportDay {
  dayOfWeek: number;
  date: string;
  label: string;
}

export interface WeeklyReportLine {
  id: string;
  label: string;
  unit: "currency" | "percent";
  isAveraged: boolean;
  weekTotal: number | null;
}

export interface HeadlineRow {
  area: Area;
  weeklyTarget: number | null;
  actual: number | null;
  variance: number | null;
  isBehind: boolean;
  prevActual: number | null;
  trend: number | null; // % change for currency areas, percentage points for percent areas
}

export interface WeeklyReportData {
  monday: Date;
  mondayIso: string;
  isCurrentWeek: boolean;
  weekClosed: boolean;
  days: WeeklyReportDay[];
  daysReported: number;
  generatedLabel: string;
  hasAnyTargets: boolean;
  lines: WeeklyReportLine[];
  actuals: Record<string, number>; // key = `${date}|${lineId}`
  headline: HeadlineRow[];
  targetsByHeadlineDay: Record<string, Record<number, number>>; // area.id -> dayOfWeek -> amount
}

function sumAreaActual(memberLineIds: string[], days: WeeklyReportDay[], actualsByLineDate: Map<string, Map<string, number>>) {
  let total = 0;
  let daysWithValue = 0;
  for (const d of days) {
    let dayTotal = 0;
    let hasValue = false;
    for (const lineId of memberLineIds) {
      const v = actualsByLineDate.get(lineId)?.get(d.date);
      if (v !== undefined) {
        dayTotal += v;
        hasValue = true;
      }
    }
    if (hasValue) {
      total += dayTotal;
      daysWithValue += 1;
    }
  }
  return { total, daysWithValue };
}

export async function fetchWeeklyReportData(supabase: SupabaseClient, weekParam?: string): Promise<WeeklyReportData> {
  const today = venueNow();
  const requestedMonday =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? new Date(`${weekParam}T00:00:00Z`) : today;
  const monday = mondayOf(requestedMonday);
  const thisWeekMonday = mondayOf(today);
  const isCurrentWeek = toIsoDate(monday) === toIsoDate(thisWeekMonday);
  const mondayIso = toIsoDate(monday);
  const prevMondayIso = toIsoDate(addDays(monday, -7));

  const days: WeeklyReportDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return {
      dayOfWeek: i,
      date: toIsoDate(d),
      label: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    };
  });
  const prevDays: WeeklyReportDay[] = days.map((d) => ({
    ...d,
    date: toIsoDate(addDays(new Date(`${d.date}T00:00:00Z`), -7)),
  }));

  const weekId = await ensureWeekTargetsSeeded(supabase, mondayIso);
  const areas = await fetchAreas(supabase);

  const [{ data: weekRow }, { data: weeklyTargetRows }, { data: actualRows }, { data: prevActualRows }] = await Promise.all([
    supabase.from("rev_weeks").select("status").eq("id", weekId).single(),
    supabase.from("rev_weekly_targets").select("revenue_line_id, group_id, day_of_week, amount").eq("week_id", weekId),
    supabase
      .from("rev_daily_actuals")
      .select("trade_date, revenue_line_id, value")
      .eq("venue_id", VENUE_ID)
      .gte("trade_date", days[0].date)
      .lte("trade_date", days[6].date),
    supabase
      .from("rev_daily_actuals")
      .select("trade_date, revenue_line_id, value")
      .eq("venue_id", VENUE_ID)
      .gte("trade_date", prevMondayIso)
      .lte("trade_date", prevDays[6].date),
  ]);

  const targetsByAreaDay = new Map<string, Map<number, number>>();
  for (const row of weeklyTargetRows ?? []) {
    const areaId = (row.revenue_line_id ?? row.group_id) as string;
    if (!targetsByAreaDay.has(areaId)) targetsByAreaDay.set(areaId, new Map());
    targetsByAreaDay.get(areaId)!.set(row.day_of_week, Number(row.amount));
  }

  function toActualsMap(rows: { trade_date: string; revenue_line_id: string; value: number }[] | null) {
    const map = new Map<string, Map<string, number>>();
    for (const row of rows ?? []) {
      if (!map.has(row.revenue_line_id)) map.set(row.revenue_line_id, new Map());
      map.get(row.revenue_line_id)!.set(row.trade_date, Number(row.value));
    }
    return map;
  }
  const actualsByLineDate = toActualsMap(actualRows);
  const prevActualsByLineDate = toActualsMap(prevActualRows);

  const lineAreas = areas.filter((a) => a.kind === "line");
  const lines: WeeklyReportLine[] = lineAreas.map((a) => {
    const { total, daysWithValue } = sumAreaActual(a.memberLineIds, days, actualsByLineDate);
    const weekTotal = daysWithValue === 0 ? null : a.isAveraged ? total / daysWithValue : total;
    return { id: a.id, label: a.label, unit: a.unit, isAveraged: a.isAveraged, weekTotal };
  });

  const actuals: Record<string, number> = {};
  for (const row of actualRows ?? []) {
    actuals[`${row.trade_date}|${row.revenue_line_id}`] = Number(row.value);
  }

  const daysReported = days.filter((d) => lineAreas.every((a) => actualsByLineDate.get(a.id)?.has(d.date))).length;

  const headlineAreas = HEADLINE_KEYS.map((key) => areas.find((a) => a.key === key)).filter(
    (a): a is Area => a !== undefined
  );

  function sumTarget(areaId: string, dayList: WeeklyReportDay[]) {
    const byDay = targetsByAreaDay.get(areaId);
    if (!byDay) return 0;
    return dayList.reduce((acc, d) => acc + (byDay.get(d.dayOfWeek) ?? 0), 0);
  }

  const headline: HeadlineRow[] = headlineAreas.map((area) => {
    const hasTarget = targetsByAreaDay.has(area.id);
    const targetTotal = sumTarget(area.id, days);
    const weeklyTarget = hasTarget ? (area.isAveraged ? targetTotal / 7 : targetTotal) : null;

    const { total, daysWithValue } = sumAreaActual(area.memberLineIds, days, actualsByLineDate);
    const actual = daysWithValue === 0 ? null : area.isAveraged ? total / daysWithValue : total;

    const { total: prevTotal, daysWithValue: prevDaysWithValue } = sumAreaActual(
      area.memberLineIds,
      prevDays,
      prevActualsByLineDate
    );
    const prevActual = prevDaysWithValue === 0 ? null : area.isAveraged ? prevTotal / prevDaysWithValue : prevTotal;

    const variance = actual !== null && weeklyTarget !== null ? actual - weeklyTarget : null;
    const isBehind = variance !== null && variance < -0.005;

    let trend: number | null = null;
    if (actual !== null && prevActual !== null) {
      trend = area.isAveraged ? actual - prevActual : prevActual !== 0 ? ((actual - prevActual) / prevActual) * 100 : null;
    }

    return { area, weeklyTarget, actual, variance, isBehind, prevActual, trend };
  });

  const targetsByHeadlineDay: Record<string, Record<number, number>> = {};
  for (const area of headlineAreas) {
    const byDay = targetsByAreaDay.get(area.id);
    targetsByHeadlineDay[area.id] = {};
    for (const d of days) {
      targetsByHeadlineDay[area.id][d.dayOfWeek] = byDay?.get(d.dayOfWeek) ?? 0;
    }
  }

  const generatedLabel = today.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    monday,
    mondayIso,
    isCurrentWeek,
    weekClosed: weekRow?.status === "closed",
    days,
    daysReported,
    generatedLabel,
    hasAnyTargets: (weeklyTargetRows ?? []).length > 0,
    lines,
    actuals,
    headline,
    targetsByHeadlineDay,
  };
}
