import type { SupabaseClient } from "@supabase/supabase-js";
import { venueNow, mondayOf, toIsoDate } from "./constants";
import { ensureWeekTargetsSeeded, fetchAreas, fetchTargetHelpers, type Area } from "./targets";
import type { DayOfWeekWeights } from "./target-distribution";

export interface WeekTargetsData {
  monday: Date;
  mondayIso: string;
  isCurrentWeek: boolean;
  weekId: string | null;
  areas: Area[];
  targets: Record<string, number>; // key = `${areaId}|${dayOfWeek}`, this week's actual rev_weekly_targets
  weights: Record<string, DayOfWeekWeights>;
  lastWeek: Record<string, (number | null)[]>;
}

// Like the Standing Pattern page's fetch, but scoped to one week's own
// rev_weekly_targets snapshot instead of the going-forward standing pattern
// — this is what the Targets tab edits directly, so a week already open can
// be corrected without touching the template that seeds future weeks.
export async function fetchWeekTargetsData(supabase: SupabaseClient, weekParam?: string): Promise<WeekTargetsData> {
  const today = venueNow();
  const requestedMonday =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? new Date(`${weekParam}T00:00:00Z`) : today;
  const monday = mondayOf(requestedMonday);
  const thisWeekMonday = mondayOf(today);
  const isCurrentWeek = toIsoDate(monday) === toIsoDate(thisWeekMonday);
  const mondayIso = toIsoDate(monday);

  const areas = await fetchAreas(supabase);
  const weekId = await ensureWeekTargetsSeeded(supabase, mondayIso);

  const [{ data: weeklyTargetRows }, { weights, lastWeek }] = await Promise.all([
    weekId
      ? supabase.from("rev_weekly_targets").select("revenue_line_id, group_id, day_of_week, amount").eq("week_id", weekId)
      : Promise.resolve({ data: [] }),
    fetchTargetHelpers(supabase, areas),
  ]);

  const targets: Record<string, number> = {};
  for (const row of weeklyTargetRows ?? []) {
    const areaId = row.revenue_line_id ?? row.group_id;
    targets[`${areaId}|${row.day_of_week}`] = Number(row.amount);
  }

  return { monday, mondayIso, isCurrentWeek, weekId, areas, targets, weights, lastWeek };
}
