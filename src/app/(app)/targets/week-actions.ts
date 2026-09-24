"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { VENUE_ID } from "@/lib/revenue/constants";

type TargetOf = { revenueLineId: string; groupId: null } | { revenueLineId: null; groupId: string };

function revalidateAll() {
  revalidatePath("/targets");
  revalidatePath("/recovery");
  revalidatePath("/");
  revalidatePath("/week-review");
}

// Edits here touch the week's own frozen rev_weekly_targets row directly —
// unlike the standing pattern, there's no "current row" flag to find by, so
// a day is matched on (week_id, revenue_line_id/group_id, day_of_week) and
// updated in place, or inserted if this day never got a row at all (e.g. an
// area added to the standing pattern after this week was already seeded).
// A manual edit is tagged 'override' so it's visibly distinct from the
// values this week was originally seeded with.
async function upsertOneDay(
  supabase: SupabaseClient,
  weekId: string,
  target: TargetOf,
  dayOfWeek: number,
  amount: number | null
) {
  const column = target.revenueLineId ? "revenue_line_id" : "group_id";
  const id = target.revenueLineId ?? target.groupId!;

  if (amount === null) {
    const { error } = await supabase
      .from("rev_weekly_targets")
      .delete()
      .eq("week_id", weekId)
      .eq(column, id)
      .eq("day_of_week", dayOfWeek);
    if (error) throw error;
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("rev_weekly_targets")
    .update({ amount, source: "override" })
    .eq("week_id", weekId)
    .eq(column, id)
    .eq("day_of_week", dayOfWeek)
    .select("id");
  if (updateError) throw updateError;

  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase.from("rev_weekly_targets").insert({
      week_id: weekId,
      revenue_line_id: target.revenueLineId,
      group_id: target.groupId,
      day_of_week: dayOfWeek,
      amount,
      source: "override",
    });
    if (insertError) throw insertError;
  }
}

export async function upsertWeeklyTarget(weekId: string, target: TargetOf, dayOfWeek: number, amount: number | null) {
  const supabase = await createClient();
  await upsertOneDay(supabase, weekId, target, dayOfWeek, amount);
  revalidateAll();
}

// Same as upsertWeeklyTarget but for all 7 days in one round trip — backs
// the Week-total, Fill week, Copy last week, and Forecast actions on this
// page. `amounts` is indexed by day_of_week; an `undefined` entry leaves
// that day untouched.
export async function upsertWeeklyTargetsBulk(weekId: string, target: TargetOf, amounts: (number | null | undefined)[]) {
  const supabase = await createClient();
  const entries = amounts
    .map((amount, day) => [day, amount] as const)
    .filter((entry): entry is [number, number | null] => entry[1] !== undefined);
  await Promise.all(entries.map(([day, amount]) => upsertOneDay(supabase, weekId, target, day, amount)));
  revalidateAll();
}

// Discards every override this week has and reseeds it from the current
// standing pattern — the same thing opening a never-seeded week does, just
// re-run on demand for a week that's already open and has drifted from the
// template (or that was seeded before the template was corrected).
export async function resetWeekToStandingPattern(weekId: string) {
  const supabase = await createClient();

  const { error: deleteError } = await supabase.from("rev_weekly_targets").delete().eq("week_id", weekId);
  if (deleteError) throw deleteError;

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

  revalidateAll();
}
