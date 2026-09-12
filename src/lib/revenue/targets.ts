import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID } from "./constants";

export interface Area {
  id: string; // revenue_line_id for a line, group_id for a group
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
export async function ensureWeekTargetsSeeded(
  supabase: SupabaseClient,
  weekStartDate: string
): Promise<string> {
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
    if (error) throw error;
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
      const { error: insertError } = await supabase.from("rev_weekly_targets").insert(rows);
      if (insertError) throw insertError;
    }
  }

  return weekId!;
}

export async function fetchAreas(supabase: SupabaseClient): Promise<Area[]> {
  const [{ data: lines }, { data: groups }, { data: members }] = await Promise.all([
    supabase
      .from("rev_revenue_lines")
      .select("id, label, unit, is_averaged, display_order")
      .eq("venue_id", VENUE_ID)
      .eq("active", true)
      .order("display_order"),
    supabase
      .from("rev_revenue_line_groups")
      .select("id, label, display_order")
      .eq("venue_id", VENUE_ID)
      .order("display_order"),
    supabase.from("rev_revenue_line_group_members").select("group_id, revenue_line_id"),
  ]);

  const lineAreas: Area[] = (lines ?? []).map((l) => ({
    id: l.id,
    kind: "line" as const,
    label: l.label,
    unit: l.unit as "currency" | "percent",
    isAveraged: l.is_averaged,
    memberLineIds: [l.id],
    displayOrder: l.display_order,
  }));

  const groupAreas: Area[] = (groups ?? []).map((g) => ({
    id: g.id,
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
