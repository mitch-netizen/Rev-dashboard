import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "./constants";
import { ensureWeekTargetsSeeded, fetchAreas } from "./targets";
import { computeHeadlineRows, type HeadlineRow } from "./week-kpis";

export type { HeadlineRow };

export interface WeeklyReportDay {
  dayOfWeek: number;
  date: string;
  label: string;
}

export interface WeeklyReportLine {
  id: string;
  label: string;
  unit: "currency" | "percent" | "count";
  isAveraged: boolean;
  weekTotal: number | null;
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
  const todayIso = toIsoDate(today);
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
    weekId ? supabase.from("rev_weeks").select("status").eq("id", weekId).single() : Promise.resolve({ data: null }),
    weekId
      ? supabase.from("rev_weekly_targets").select("revenue_line_id, group_id, day_of_week, amount").eq("week_id", weekId)
      : Promise.resolve({ data: [] }),
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

  // "Week to date": for a closed/past week every day is already elapsed, so
  // this is the full week — but for the current, still-running week it must
  // exclude days that haven't happened yet (today's trade isn't closed out
  // until tomorrow, matching the Recovery report's convention). Comparing a
  // partial-week actual against a full-week target would otherwise mark an
  // area "Short" purely because the week isn't over.
  const elapsedDays = days.filter((d) => d.date < todayIso);
  const elapsedDayOfWeeks = new Set(elapsedDays.map((d) => d.dayOfWeek));
  const prevElapsedDays = prevDays.filter((d) => elapsedDayOfWeeks.has(d.dayOfWeek));

  const headline = computeHeadlineRows(
    areas,
    elapsedDays,
    prevElapsedDays,
    targetsByAreaDay,
    actualsByLineDate,
    prevActualsByLineDate
  );
  const headlineAreas = headline.map((h) => h.area);

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
