import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchWeekTargetsData } from "@/lib/revenue/week-targets";
import { fetchWeekKpis } from "@/lib/revenue/week-kpis";
import WeekShell from "../week-shell";
import WeekTargetsGrid from "./week-targets-grid";
import ResetWeekButton from "./reset-week-button";

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const [{ mondayIso, isCurrentWeek, weekId, areas, targets, weights, lastWeek }, { headline }] = await Promise.all([
    fetchWeekTargetsData(supabase, week),
    fetchWeekKpis(supabase, week),
  ]);

  return (
    <WeekShell
      active="targets"
      mondayIso={mondayIso}
      isCurrentWeek={isCurrentWeek}
      kpis={headline}
      actions={weekId ? <ResetWeekButton weekId={weekId} /> : undefined}
    >
      <p className="text-sm print:hidden" style={{ color: "var(--qr-ink-soft)" }}>
        Editing here changes only this week — the{" "}
        <Link href="/targets/standing" className="underline">
          standing pattern
        </Link>{" "}
        that seeds future weeks is separate. Type into a day directly, or use Week / Fill week /
        Copy last wk / Forecast to fill a row from a total.
      </p>

      {weekId ? (
        <WeekTargetsGrid weekId={weekId} areas={areas} targets={targets} weights={weights} lastWeek={lastWeek} />
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          This week hasn&apos;t been opened yet and you don&apos;t have permission to seed it —
          ask an admin or manager to open it first.
        </div>
      )}
    </WeekShell>
  );
}
