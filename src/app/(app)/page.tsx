import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, toIsoDate } from "@/lib/revenue/constants";
import { fetchWeekGridData } from "@/lib/revenue/week-grid-data";
import WeekGrid from "./week-grid";
import ExportBar from "./export-bar";

export default async function CurrentWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const { monday, mondayIso, isCurrentWeek, days, lines, actuals } = await fetchWeekGridData(supabase, week);

  const totalCells = lines.length * days.length;
  const filledCells = Object.keys(actuals).length;

  const prevWeek = toIsoDate(addDays(monday, -7));
  const nextWeek = toIsoDate(addDays(monday, 7));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{isCurrentWeek ? "Current Week" : "Week"}</h1>
          <p className="text-sm text-neutral-500">
            {days[0].label} – {days[6].label} · {filledCells} of {totalCells} figures entered
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm print:hidden">
          <Link
            href={`/?week=${prevWeek}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            ← Previous week
          </Link>
          {!isCurrentWeek && (
            <Link href="/" className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
              This week
            </Link>
          )}
          <Link
            href={`/?week=${nextWeek}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Next week →
          </Link>
          <ExportBar excelHref={`/api/export/week?week=${mondayIso}`} reportHref={`/report?week=${mondayIso}`} />
        </div>
      </div>
      <WeekGrid days={days} lines={lines} actuals={actuals} />
    </div>
  );
}
