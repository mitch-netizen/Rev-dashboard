import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "./constants";
import { computeDayOfWeekWeights, type DayOfWeekWeights } from "./target-distribution";

export interface Area {
  id: string; // revenue_line_id for a line, group_id for a group
  key: string; // the stable rev_revenue_lines.key / rev_revenue_line_groups.key
  kind: "line" | "group";
  label: string;
  unit: "currency" | "percent";
  isAveraged: boolean;
  memberLineIds: string[]; // a line area is its own single member
  displayOrder: number;
}

// Finds (or opens) the rev_weeks row for this Monday and, the first time it's
// looked at, freezes the current standing pattern into rev_weekly_targets —
// per the schema's design, that snapshot then never changes even if the
// standing pattern is edited later. Safe to call on every page load: it's a
// no-op once a week has targets.
//
// Both inserts are RLS-restricted to admin/manager (see the schema migration),
// but any venue member can read this data — a coordinator (or anyone else who
// isn't admin/manager) opening a week nobody has seeded yet must not crash the
// page just because they can't be the one to seed it. Returns null when
// seeding was blocked so callers can fall back to "no targets yet" instead.
export async function ensureWeekTargetsSeeded(
  supabase: SupabaseClient,
  weekStartDate: string
): Promise<string | null> {
  const { data: existingWeek } = await supabase
    .from("rev_weeks")
    .select("id")
    .eq("venue_id", VENUE_ID)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();

  let weekId = existingWeek?.id as string | undefined;

  if (!weekId) {
    const { data: inserted, error } = await supabase
      .from("rev_weeks")
      .insert({ venue_id: VENUE_ID, week_start_date: weekStartDate })
      .select("id")
      .single();
    if (error) return null;
    weekId = inserted.id;
  }

  const { count } = await supabase
    .from("rev_weekly_targets")
    .select("id", { count: "exact", head: true })
    .eq("week_id", weekId);

  if (!count) {
    const { data: standing, error: standingError } = await supabase
      .from("rev_standing_targets")
      .select("revenue_line_id, group_id, day_of_week, amount")
      .eq("venue_id", VENUE_ID)
      .is("effective_to", null);
    if (standingError) throw standingError;

    if (standing && standing.length > 0) {
      const rows = standing.map((s) => ({
        week_id: weekId,
        revenue_line_id: s.revenue_line_id,
        group_id: s.group_id,
        day_of_week: s.day_of_week,
        amount: s.amount,
        source: "standing_pattern" as const,
      }));
      // If this fails on RLS, the week row exists but stays without targets
      // for this viewer — still returned so actuals-only reads keep working.
      await supabase.from("rev_weekly_targets").insert(rows);
    }
  }

  return weekId!;
}

export async function fetchAreas(supabase: SupabaseClient): Promise<Area[]> {
  const [{ data: lines }, { data: groups }, { data: members }] = await Promise.all([
    supabase
      .from("rev_revenue_lines")
      .select("id, key, label, unit, is_averaged, display_order")
      .eq("venue_id", VENUE_ID)
      .eq("active", true)
      .order("display_order"),
    supabase
      .from("rev_revenue_line_groups")
      .select("id, key, label, display_order")
      .eq("venue_id", VENUE_ID)
      .order("display_order"),
    supabase.from("rev_revenue_line_group_members").select("group_id, revenue_line_id"),
  ]);

  const lineAreas: Area[] = (lines ?? []).map((l) => ({
    id: l.id,
    key: l.key,
    kind: "line" as const,
    label: l.label,
    unit: l.unit as "currency" | "percent",
    isAveraged: l.is_averaged,
    memberLineIds: [l.id],
    displayOrder: l.display_order,
  }));

  const groupAreas: Area[] = (groups ?? []).map((g) => ({
    id: g.id,
    key: g.key,
    kind: "group" as const,
    label: g.label,
    unit: "currency" as const,
    isAveraged: false,
    memberLineIds: (members ?? [])
      .filter((m) => m.group_id === g.id)
      .map((m) => m.revenue_line_id),
    // groups render after every line, in their own display_order
    displayOrder: 1000 + g.display_order,
  }));

  return [...lineAreas, ...groupAreas].sort((a, b) => a.displayOrder - b.displayOrder);
}

const WEIGHT_LOOKBACK_DAYS = 56; // 8 weeks — enough to average out one-off blips, recent enough to reflect current trading

export interface TargetHelpers {
  // Historical day-of-week weights for the monthly forecast / weekly total
  // distribution, keyed by area id.
  weights: Record<string, DayOfWeekWeights>;
  // Last full week's actuals per area, Monday..Sunday, null where that day
  // has no recorded actual yet — feeds the "Copy last week" action.
  lastWeek: Record<string, (number | null)[]>;
}

// One rev_daily_actuals fetch, wide enough to cover both the weight lookback
// window and last week, then sliced two ways per area.
export async function fetchTargetHelpers(supabase: SupabaseClient, areas: Area[]): Promise<TargetHelpers> {
  const allLineIds = [...new Set(areas.flatMap((a) => a.memberLineIds))];
  const weights: Record<string, DayOfWeekWeights> = {};
  const lastWeek: Record<string, (number | null)[]> = {};
  if (allLineIds.length === 0) {
    for (const area of areas) {
      weights[area.id] = computeDayOfWeekWeights([]);
      lastWeek[area.id] = [null, null, null, null, null, null, null];
    }
    return { weights, lastWeek };
  }

  const today = venueNow();
  const todayIso = toIsoDate(today);
  const fromIso = toIsoDate(addDays(today, -WEIGHT_LOOKBACK_DAYS));
  const thisMonday = mondayOf(today);
  const lastMondayIso = toIsoDate(addDays(thisMonday, -7));

  const { data } = await supabase
    .from("rev_daily_actuals")
    .select("trade_date, revenue_line_id, value")
    .eq("venue_id", VENUE_ID)
    .in("revenue_line_id", allLineIds)
    .gte("trade_date", fromIso)
    .lt("trade_date", todayIso);

  const byLineDate = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    if (!byLineDate.has(row.revenue_line_id)) byLineDate.set(row.revenue_line_id, new Map());
    byLineDate.get(row.revenue_line_id)!.set(row.trade_date, Number(row.value));
  }

  for (const area of areas) {
    const dates = new Set<string>();
    for (const lineId of area.memberLineIds) {
      for (const date of byLineDate.get(lineId)?.keys() ?? []) dates.add(date);
    }

    const rows: { date: string; value: number }[] = [];
    for (const date of dates) {
      if (area.isAveraged) {
        // isAveraged only applies to single-line areas (see fetchAreas).
        const v = byLineDate.get(area.memberLineIds[0])?.get(date);
        if (v !== undefined) rows.push({ date, value: v });
      } else {
        let sum = 0;
        let any = false;
        for (const lineId of area.memberLineIds) {
          const v = byLineDate.get(lineId)?.get(date);
          if (v !== undefined) {
            sum += v;
            any = true;
          }
        }
        if (any) rows.push({ date, value: sum });
      }
    }
    weights[area.id] = computeDayOfWeekWeights(rows);

    const byDate = new Map(rows.map((r) => [r.date, r.value]));
    lastWeek[area.id] = Array.from({ length: 7 }, (_, i) => {
      const date = toIsoDate(addDays(new Date(`${lastMondayIso}T00:00:00Z`), i));
      return byDate.get(date) ?? null;
    });
  }

  return { weights, lastWeek };
}
