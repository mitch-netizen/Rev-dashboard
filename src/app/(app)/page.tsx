import { createClient } from "@/lib/supabase/server";
import { venueNow, toIsoDate } from "@/lib/revenue/constants";
import { fetchWeekGridData } from "@/lib/revenue/week-grid-data";
import { fetchWeekKpis } from "@/lib/revenue/week-kpis";
import WeekShell from "./week-shell";
import WeekGrid from "./week-grid";
import ExportBar from "./export-bar";

export default async function CurrentWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const [{ mondayIso, isCurrentWeek, days, lines, actuals }, { headline }] = await Promise.all([
    fetchWeekGridData(supabase, week),
    fetchWeekKpis(supabase, week),
  ]);

  const totalCells = lines.length * days.length;
  const filledCells = Object.keys(actuals).length;
  const todayIso = toIsoDate(venueNow());

  return (
    <WeekShell
      active="entry"
      mondayIso={mondayIso}
      isCurrentWeek={isCurrentWeek}
      kpis={headline}
      actions={<ExportBar excelHref={`/api/export/week?week=${mondayIso}`} />}
    >
      <p className="text-sm print:hidden" style={{ color: "var(--qr-ink-soft)" }}>
        {filledCells} of {totalCells} figures entered this week
      </p>
      <WeekGrid key={mondayIso} days={days} lines={lines} actuals={actuals} todayIso={todayIso} />
    </WeekShell>
  );
}
