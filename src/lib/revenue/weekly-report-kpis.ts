import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "./constants";
import { ensureWeekTargetsSeeded, fetchAreas, type Area } from "./targets";
import { sumAreaActual } from "./week-kpis";

export interface WeeklyReportKpiRow {
  area: Area;
  target: number | null;
  actual: number | null;
  variance: number | null;
  met: boolean | null;
  // $ / count / percentage-point delta, signed
  vsLastWeekDelta: number | null;
  // % change — null for percent-unit areas, which use the pp delta above instead
  vsLastWeekPct: number | null;
  vs4WeekAvgDelta: number | null;
  vs4WeekAvgPct: number | null;
}

export interface WeeklyReportKpiGroup {
  label: string;
  rows: WeeklyReportKpiRow[];
}

export interface WeeklyReportKpiData {
  mondayIso: string;
  isCurrentWeek: boolean;
  weekId: string | null;
  groups: WeeklyReportKpiGroup[];
}

interface DayLike {
  date: string;
  dayOfWeek: number;
}

// Same five areas the Weekly Review / Recovery pages already group by,
// restricted to the lines this report actually has something to say about.
const REPORT_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Gaming", keys: ["gaming_turnover", "card_usage_gaming", "card_usage_pos", "new_members"] },
  { label: "All Bars", keys: ["all_bars", "liquor_gp_on_premise", "liquor_gp_off_premise"] },
  { label: "All Food", keys: ["all_food"] },
  { label: "Accommodation", keys: ["accommodation_occupancy"] },
  { label: "Retail", keys: ["retail"] },
];

function buildWeekDays(monday: Date): DayLike[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, date: toIsoDate(addDays(monday, i)) }));
}

function toActualsMap(rows: { trade_date: string; revenue_line_id: string; value: number }[] | null) {
  const map = new Map<string, Map<string, number>>();
  for (const row of rows ?? []) {
    if (!map.has(row.revenue_line_id)) map.set(row.revenue_line_id, new Map());
    map.get(row.revenue_line_id)!.set(row.trade_date, Number(row.value));
  }
  return map;
}

function areaActual(area: Area, days: DayLike[], actualsByLineDate: Map<string, Map<string, number>>): number | null {
  const { total, daysWithValue } = sumAreaActual(area.memberLineIds, days, actualsByLineDate);
  return daysWithValue === 0 ? null : area.isAveraged ? total / daysWithValue : total;
}

function areaTarget(area: Area, days: DayLike[], targetsByAreaDay: Map<string, Map<number, number>>): number | null {
  const byDay = targetsByAreaDay.get(area.id);
  if (!byDay) return null;
  const total = days.reduce((acc, d) => acc + (byDay.get(d.dayOfWeek) ?? 0), 0);
  return area.isAveraged ? total / days.length : total;
}

function deltaAndPct(actual: number | null, base: number | null, isAveraged: boolean) {
  if (actual === null || base === null) return { delta: null, pct: null };
  const delta = actual - base;
  const pct = isAveraged ? null : base !== 0 ? (delta / base) * 100 : null;
  return { delta, pct };
}

// Full Monday–Sunday totals throughout, same convention as the Daily Actuals
// table (weekly-report.ts) and the PDF export it drives — this report is
// about a week's finished performance, not an in-progress pace, so (unlike
// the live KPI strip) it never excludes "today" from the current week.
export async function fetchWeeklyReportKpis(supabase: SupabaseClient, weekParam?: string): Promise<WeeklyReportKpiData> {
  const today = venueNow();
  const requestedMonday =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? new Date(`${weekParam}T00:00:00Z`) : today;
  const monday = mondayOf(requestedMonday);
  const mondayIso = toIsoDate(monday);
  const isCurrentWeek = mondayIso === toIsoDate(mondayOf(today));

  const weekId = await ensureWeekTargetsSeeded(supabase, mondayIso);
  const areas = await fetchAreas(supabase);
  const areaByKey = new Map(areas.map((a) => [a.key, a]));

  const reportAreas = REPORT_GROUPS.flatMap((g) => g.keys)
    .map((k) => areaByKey.get(k))
    .filter((a): a is Area => a !== undefined);
  const lineIds = [...new Set(reportAreas.flatMap((a) => a.memberLineIds))];

  const days = buildWeekDays(monday);
  const earliestMonday = addDays(monday, -28); // this week + the 4 completed weeks before it

  const [{ data: actualRows }, { data: weeklyTargetRows }] = await Promise.all([
    lineIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("rev_daily_actuals")
          .select("trade_date, revenue_line_id, value")
          .eq("venue_id", VENUE_ID)
          .in("revenue_line_id", lineIds)
          .gte("trade_date", toIsoDate(earliestMonday))
          .lte("trade_date", days[6].date),
    weekId
      ? supabase.from("rev_weekly_targets").select("revenue_line_id, group_id, day_of_week, amount").eq("week_id", weekId)
      : Promise.resolve({ data: [] }),
  ]);

  const actualsByLineDate = toActualsMap(actualRows);

  const targetsByAreaDay = new Map<string, Map<number, number>>();
  for (const row of weeklyTargetRows ?? []) {
    const areaId = (row.revenue_line_id ?? row.group_id) as string;
    if (!targetsByAreaDay.has(areaId)) targetsByAreaDay.set(areaId, new Map());
    targetsByAreaDay.get(areaId)!.set(row.day_of_week, Number(row.amount));
  }

  const lastWeekDays = buildWeekDays(addDays(monday, -7));
  const avgWeekDaysList = [1, 2, 3, 4].map((n) => buildWeekDays(addDays(monday, -7 * n)));

  function rowFor(key: string): WeeklyReportKpiRow | null {
    const area = areaByKey.get(key);
    if (!area) return null;

    const actual = areaActual(area, days, actualsByLineDate);
    const target = areaTarget(area, days, targetsByAreaDay);
    const variance = actual !== null && target !== null ? actual - target : null;
    const met = variance !== null ? variance >= -0.005 : null;

    const lastWeekActual = areaActual(area, lastWeekDays, actualsByLineDate);
    const avgValues = avgWeekDaysList
      .map((d) => areaActual(area, d, actualsByLineDate))
      .filter((v): v is number => v !== null);
    const avg4Week = avgValues.length > 0 ? avgValues.reduce((a, b) => a + b, 0) / avgValues.length : null;

    const vsLastWeek = deltaAndPct(actual, lastWeekActual, area.isAveraged);
    const vs4WeekAvg = deltaAndPct(actual, avg4Week, area.isAveraged);

    return {
      area,
      target,
      actual,
      variance,
      met,
      vsLastWeekDelta: vsLastWeek.delta,
      vsLastWeekPct: vsLastWeek.pct,
      vs4WeekAvgDelta: vs4WeekAvg.delta,
      vs4WeekAvgPct: vs4WeekAvg.pct,
    };
  }

  const groups: WeeklyReportKpiGroup[] = REPORT_GROUPS.map((g) => ({
    label: g.label,
    rows: g.keys.map(rowFor).filter((r): r is WeeklyReportKpiRow => r !== null),
  })).filter((g) => g.rows.length > 0);

  return { mondayIso, isCurrentWeek, weekId, groups };
}
