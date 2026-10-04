"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WEEKLY_REPORT_FIELD_IDS } from "@/lib/revenue/weekly-report-fields";

// Commits one field at a time (onBlur, same convention as the Targets grid)
// rather than the whole form, so one save never clobbers a value someone
// else is mid-way through typing in another field.
export async function saveWeeklyReportField(weekId: string, field: string, value: string) {
  if (!WEEKLY_REPORT_FIELD_IDS.includes(field)) throw new Error(`Unknown weekly report field: ${field}`);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("rev_weekly_report_notes")
    .select("answers")
    .eq("week_id", weekId)
    .maybeSingle();

  const answers = { ...((existing?.answers as Record<string, string>) ?? {}), [field]: value };
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (existing) {
    const { error } = await supabase
      .from("rev_weekly_report_notes")
      .update({ answers, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq("week_id", weekId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("rev_weekly_report_notes")
      .insert({ week_id: weekId, answers, updated_by: user?.id ?? null });
    if (error) throw error;
  }

  revalidatePath("/weekly-report");
}
