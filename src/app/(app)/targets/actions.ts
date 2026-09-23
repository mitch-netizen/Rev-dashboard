"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { VENUE_ID } from "@/lib/revenue/constants";

type StandingTargetOf =
  | { revenueLineId: string; groupId: null }
  | { revenueLineId: null; groupId: string };

// The "current" standing target for a line/day (or group/day) is the row
// with effective_to is null (see rev_standing_targets_current_line/group in
// the schema). We just update that row's amount in place rather than
// versioning every edit — the thing that must never silently change once
// set is a week's own frozen rev_weekly_targets snapshot, not the standing
// pattern feeding future weeks.
async function upsertOneDay(
  supabase: SupabaseClient,
  target: StandingTargetOf,
  dayOfWeek: number,
  amount: number | null
) {
  const column = target.revenueLineId ? "revenue_line_id" : "group_id";
  const id = target.revenueLineId ?? target.groupId!;

  if (amount === null) {
    const { error } = await supabase
      .from("rev_standing_targets")
      .delete()
      .eq(column, id)
      .eq("day_of_week", dayOfWeek)
      .is("effective_to", null);
    if (error) throw error;
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("rev_standing_targets")
    .update({ amount })
    .eq(column, id)
    .eq("day_of_week", dayOfWeek)
    .is("effective_to", null)
    .select("id");
  if (updateError) throw updateError;

  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase.from("rev_standing_targets").insert({
      venue_id: VENUE_ID,
      revenue_line_id: target.revenueLineId,
      group_id: target.groupId,
      day_of_week: dayOfWeek,
      amount,
    });
    if (insertError) throw insertError;
  }
}

export async function upsertStandingTarget(target: StandingTargetOf, dayOfWeek: number, amount: number | null) {
  const supabase = await createClient();
  await upsertOneDay(supabase, target, dayOfWeek, amount);
  revalidatePath("/targets");
  revalidatePath("/recovery");
  revalidatePath("/");
  revalidatePath("/week-review");
}

// Same as upsertStandingTarget but for all 7 days in one round trip — backs
// the Week-total, Fill week, Copy last week, and Forecast actions. `amounts`
// is indexed by day_of_week (0=Monday..6=Sunday); an `undefined` entry
// leaves that day's standing target untouched (used by Copy last week for a
// day with no recorded actual to copy).
export async function upsertStandingTargetsBulk(target: StandingTargetOf, amounts: (number | null | undefined)[]) {
  const supabase = await createClient();
  const entries = amounts
    .map((amount, day) => [day, amount] as const)
    .filter((entry): entry is [number, number | null] => entry[1] !== undefined);
  await Promise.all(entries.map(([day, amount]) => upsertOneDay(supabase, target, day, amount)));
  revalidatePath("/targets");
  revalidatePath("/recovery");
  revalidatePath("/");
  revalidatePath("/week-review");
}
