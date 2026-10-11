import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchWeekKpis } from "@/lib/revenue/week-kpis";
import { fetchWeeklyReportKpis } from "@/lib/revenue/weekly-report-kpis";
import WeekShell from "../week-shell";
import DashboardKpiGrid from "./dashboard-kpi-grid";
import DashboardBrief from "./dashboard-brief";

const QUICK_LINKS = [
  { href: "/week-review", label: "Full Weekly Review" },
  { href: "/recovery", label: "Recovery / Pacing" },
  { href: "/targets", label: "Targets" },
  { href: "/weekly-report", label: "Weekly Report notes" },
];

export default async function DashboardPage({
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

  let answers: Record<string, string> = {};
  if (weekId) {
    const { data } = await supabase
      .from("rev_weekly_report_notes")
      .select("answers")
      .eq("week_id", weekId)
      .maybeSingle();
    if (data?.answers) answers = data.answers as Record<string, string>;
  }

  return (
    <WeekShell active="dashboard" mondayIso={mondayIso} isCurrentWeek={isCurrentWeek} kpis={headline}>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-base font-bold" style={{ color: "var(--qr-ink)" }}>
            Results
          </h2>
          <div className="mt-3">
            <DashboardKpiGrid groups={groups} />
          </div>
        </div>

        <div>
          <h2 className="font-display text-base font-bold" style={{ color: "var(--qr-ink)" }}>
            This Week in Brief
          </h2>
          <div className="mt-3">
            <DashboardBrief answers={answers} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--qr-line)" }}>
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-none border px-3 py-1.5 text-sm hover:opacity-80"
              style={{ borderColor: "var(--qr-line)", color: "var(--qr-ink-soft)" }}
            >
              {link.label} →
            </Link>
          ))}
        </div>
      </div>
    </WeekShell>
  );
}
