"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { VENUE_ID } from "@/lib/revenue/constants";

// The "current" standing target for a line/day (or group/day) is the row
// with effective_to is null (see rev_standing_targets_current_line/group in
// the schema). We just update that row's amount in place rather than
// versioning every edit — the thing that must never silently change once
// set is a week's own frozen rev_weekly_targets snapshot, not the standing
// pattern feeding future weeks.
export async function upsertStandingTarget(
  target: { revenueLineId: string; groupId: null } | { revenueLineId: null; groupId: string },
  dayOfWeek: number,
  amount: number | null
) {
  const supabase = await createClient();

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
    revalidatePath("/targets");
    revalidatePath("/recovery");
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

  revalidatePath("/targets");
  revalidatePath("/recovery");
}
