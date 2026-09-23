import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "./constants";
import { ensureWeekTargetsSeeded, fetchAreas, type Area } from "./targets";

// The five headline areas the dashboard leads with, in display order — two
// individual lines plus the three group targets. There's no schema flag for
// "headline"; these keys are the ones the venue actually reports on.
export const HEADLINE_KEYS = ["gaming_turnover", "all_bars", "all_food", "retail", "accommodation_occupancy"];

export interface HeadlineRow {
  area: Area;
  weeklyTarget: number | null;
  actual: number | null;
  variance: number | null;
  isBehind: boolean;
  prevActual: number | null;
  trend: number | null; // % change for currency areas, percentage points for percent areas
}

interface DayLike {
  date: string;
  dayOfWeek: number;
}

function sumAreaActual(memberLineIds: string[], days: DayLike[], actualsByLineDate: Map<string, Map<string, number>>) {
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

// Pure — the Weekly Review page (which already has this data fetched for its
// own daily table) and the lightweight KPI strip below both call this, so the
// headline math can never drift between the two.
export function computeHeadlineRows(
  areas: Area[],
  elapsedDays: DayLike[],
  prevElapsedDays: DayLike[],
  targetsByAreaDay: Map<string, Map<number, number>>,
  actualsByLineDate: Map<string, Map<string, number>>,
  prevActualsByLineDate: Map<string, Map<string, number>>
): HeadlineRow[] {
  const headlineAreas = HEADLINE_KEYS.map((key) => areas.find((a) => a.key === key)).filter(
    (a): a is Area => a !== undefined
  );

  function sumTarget(areaId: string, dayList: DayLike[]) {
    const byDay = targetsByAreaDay.get(areaId);
    if (!byDay) return 0;
    return dayList.reduce((acc, d) => acc + (byDay.get(d.dayOfWeek) ?? 0), 0);
  }

  return headlineAreas.map((area) => {
    const hasTarget = targetsByAreaDay.has(area.id);
    const targetTotal = sumTarget(area.id, elapsedDays);
    const weeklyTarget =
      hasTarget && elapsedDays.length > 0 ? (area.isAveraged ? targetTotal / elapsedDays.length : targetTotal) : null;

    const { total, daysWithValue } = sumAreaActual(area.memberLineIds, elapsedDays, actualsByLineDate);
    const actual = daysWithValue === 0 ? null : area.isAveraged ? total / daysWithValue : total;

    const { total: prevTotal, daysWithValue: prevDaysWithValue } = sumAreaActual(
      area.memberLineIds,
      prevElapsedDays,
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
}

export interface WeekKpiData {
  monday: Date;
  mondayIso: string;
  isCurrentWeek: boolean;
  headline: HeadlineRow[];
}

// Lightweight fetch for pages that only need the KPI strip (Entry, Recovery)
// — the Weekly Review page fetches its own broader data set and calls
// computeHeadlineRows directly instead of this.
export async function fetchWeekKpis(supabase: SupabaseClient, weekParam?: string): Promise<WeekKpiData> {
  const today = venueNow();
  const requestedMonday =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? new Date(`${weekParam}T00:00:00Z`) : today;
  const monday = mondayOf(requestedMonday);
  const thisWeekMonday = mondayOf(today);
  const isCurrentWeek = toIsoDate(monday) === toIsoDate(thisWeekMonday);
  const mondayIso = toIsoDate(monday);
  const todayIso = toIsoDate(today);
  const prevMondayIso = toIsoDate(addDays(monday, -7));

  const days: DayLike[] = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    date: toIsoDate(addDays(monday, i)),
  }));
  const prevDays: DayLike[] = days.map((d) => ({
    ...d,
    date: toIsoDate(addDays(new Date(`${d.date}T00:00:00Z`), -7)),
  }));

  const weekId = await ensureWeekTargetsSeeded(supabase, mondayIso);
  const areas = await fetchAreas(supabase);

  const [{ data: weeklyTargetRows }, { data: actualRows }, { data: prevActualRows }] = await Promise.all([
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

  return { monday, mondayIso, isCurrentWeek, headline };
}
