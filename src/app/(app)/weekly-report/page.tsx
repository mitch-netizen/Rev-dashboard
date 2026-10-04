import { createClient } from "@/lib/supabase/server";
import { fetchWeekKpis } from "@/lib/revenue/week-kpis";
import { fetchWeeklyReportKpis } from "@/lib/revenue/weekly-report-kpis";
import { addDays, toIsoDate } from "@/lib/revenue/constants";
import WeekShell from "../week-shell";
import WeeklyReportNotesForm from "./notes-form";

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const [{ mondayIso, isCurrentWeek, weekId, groups }, { headline }] = await Promise.all([
    fetchWeeklyReportKpis(supabase, week),
    fetchWeekKpis(supabase, week),
  ]);

  let initialAnswers: Record<string, string> = {};
  if (weekId) {
    const { data } = await supabase
      .from("rev_weekly_report_notes")
      .select("answers")
      .eq("week_id", weekId)
      .maybeSingle();
    if (data?.answers) initialAnswers = data.answers as Record<string, string>;
  }

  const weekEndingDefault = toIsoDate(addDays(new Date(`${mondayIso}T00:00:00Z`), 6));

  return (
    <WeekShell active="weekly-report" mondayIso={mondayIso} isCurrentWeek={isCurrentWeek} kpis={headline}>
      {weekId ? (
        <WeeklyReportNotesForm
          weekId={weekId}
          initialAnswers={initialAnswers}
          kpiGroups={groups}
          weekEndingDefault={weekEndingDefault}
        />
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          This week hasn&apos;t been opened yet and you don&apos;t have permission to seed it — ask an admin or
          manager to open it first.
        </div>
      )}
    </WeekShell>
  );
}
