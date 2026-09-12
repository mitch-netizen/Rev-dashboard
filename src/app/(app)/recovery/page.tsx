import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, toIsoDate } from "@/lib/revenue/constants";
import { computeRecoveryReport } from "@/lib/revenue/recovery";
import ExportBar from "../export-bar";

function formatArea(value: number, unit: "currency" | "percent") {
  return unit === "percent"
    ? `${value.toFixed(1)}%`
    : value.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const { monday, mondayIso, days, isCurrentWeek, hasAnyTargets, rows, remainingDaysCount } =
    await computeRecoveryReport(supabase, week);

  const prevWeek = toIsoDate(addDays(monday, -7));
  const nextWeek = toIsoDate(addDays(monday, 7));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Recovery — weekly accrual vs target</h1>
          <p className="text-sm text-neutral-500">
            {days[0].label} – {days[6].label} · as of {isCurrentWeek ? "today" : "week end"}, {remainingDaysCount}{" "}
            day{remainingDaysCount === 1 ? "" : "s"} left
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm print:hidden">
          <Link href={`/recovery?week=${prevWeek}`} className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
            ← Previous week
          </Link>
          {!isCurrentWeek && (
            <Link href="/recovery" className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
              This week
            </Link>
          )}
          <Link href={`/recovery?week=${nextWeek}`} className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
            Next week →
          </Link>
          <ExportBar excelHref={`/api/export/recovery?week=${mondayIso}`} reportHref={`/report?week=${mondayIso}`} />
        </div>
      </div>

      {!hasAnyTargets && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 print:hidden">
          No targets are set up yet, so this report has nothing to compare against.{" "}
          <Link href="/targets" className="underline">
            Set up targets
          </Link>{" "}
          first.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 border-b border-neutral-200 bg-white p-2 text-left font-medium dark:border-neutral-800 dark:bg-neutral-900">
                Area
              </th>
              <th className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">Weekly target</th>
              <th className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">Target to date</th>
              <th className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">Actual to date</th>
              <th className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">Variance</th>
              <th className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">Normal daily target (rest of week)</th>
              <th className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">Extra needed per day</th>
              <th className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">New required daily target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.area.id}
                className={`border-b border-neutral-100 dark:border-neutral-900 ${
                  r.area.kind === "group" ? "bg-neutral-50 font-medium dark:bg-neutral-900/40" : ""
                }`}
              >
                <td className="sticky left-0 bg-inherit p-2 text-neutral-700 dark:text-neutral-300">{r.area.label}</td>
                <td className="p-2 text-right">{formatArea(r.weeklyTarget, r.area.unit)}</td>
                <td className="p-2 text-right">{r.accruedTarget !== null ? formatArea(r.accruedTarget, r.area.unit) : "—"}</td>
                <td className="p-2 text-right">{r.accruedActual !== null ? formatArea(r.accruedActual, r.area.unit) : "—"}</td>
                <td
                  className={`p-2 text-right font-medium ${
                    r.variance === null
                      ? ""
                      : r.variance < -0.005
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {r.variance !== null
                    ? `${r.variance >= 0 ? "+" : ""}${formatArea(r.variance, r.area.unit)}`
                    : "—"}
                </td>
                {r.remainingDaysCount > 0 ? (
                  <>
                    <td className="p-2 text-right">{formatArea(r.normalRemainingDailyAvg ?? 0, r.area.unit)}</td>
                    <td className={`p-2 text-right ${r.isBehind ? "font-medium text-red-600 dark:text-red-400" : "text-neutral-400"}`}>
                      {r.isBehind ? `+${formatArea(r.catchUpPerDay, r.area.unit)}` : "—"}
                    </td>
                    <td className="p-2 text-right font-medium">
                      {formatArea(r.requiredDailyAvgRemaining ?? 0, r.area.unit)}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className={`p-2 text-right ${r.isBehind ? "font-medium text-red-600 dark:text-red-400" : "text-neutral-400"}`}>
                    {r.isBehind ? `Week complete — missed by ${formatArea(-(r.variance ?? 0), r.area.unit)}` : "Week complete"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
