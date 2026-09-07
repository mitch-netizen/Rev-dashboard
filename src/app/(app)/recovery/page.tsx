import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "@/lib/revenue/constants";
import { ensureWeekTargetsSeeded, fetchAreas } from "@/lib/revenue/targets";

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

  const today = venueNow();
  const requestedMonday = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00Z`) : today;
  const monday = mondayOf(requestedMonday);
  const thisWeekMonday = mondayOf(today);
  const isCurrentWeek = toIsoDate(monday) === toIsoDate(thisWeekMonday);
  const todayIso = toIsoDate(today);
  const mondayIso = toIsoDate(monday);
  const prevWeek = toIsoDate(addDays(monday, -7));
  const nextWeek = toIsoDate(addDays(monday, 7));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return {
      dayOfWeek: i,
      date: toIsoDate(d),
      label: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    };
  });

  const weekId = await ensureWeekTargetsSeeded(supabase, mondayIso);
  const areas = await fetchAreas(supabase);

  const [{ data: weeklyTargetRows }, { data: actualRows }] = await Promise.all([
    supabase
      .from("rev_weekly_targets")
      .select("revenue_line_id, group_id, day_of_week, amount")
      .eq("week_id", weekId),
    supabase
      .from("rev_daily_actuals")
      .select("trade_date, revenue_line_id, value")
      .eq("venue_id", VENUE_ID)
      .gte("trade_date", days[0].date)
      .lte("trade_date", days[6].date),
  ]);

  const targetsByAreaDay = new Map<string, Map<number, number>>();
  for (const row of weeklyTargetRows ?? []) {
    const areaId = (row.revenue_line_id ?? row.group_id) as string;
    if (!targetsByAreaDay.has(areaId)) targetsByAreaDay.set(areaId, new Map());
    targetsByAreaDay.get(areaId)!.set(row.day_of_week, Number(row.amount));
  }

  const actualsByLineDate = new Map<string, Map<string, number>>();
  for (const row of actualRows ?? []) {
    if (!actualsByLineDate.has(row.revenue_line_id)) actualsByLineDate.set(row.revenue_line_id, new Map());
    actualsByLineDate.get(row.revenue_line_id)!.set(row.trade_date, Number(row.value));
  }

  const hasAnyTargets = (weeklyTargetRows ?? []).length > 0;

  const elapsedDays = days.filter((d) => d.date <= todayIso);
  const remainingDays = days.filter((d) => d.date > todayIso);

  function targetFor(areaId: string, dayOfWeek: number) {
    return targetsByAreaDay.get(areaId)?.get(dayOfWeek) ?? 0;
  }

  function actualFor(memberLineIds: string[], date: string) {
    let total = 0;
    let hasValue = false;
    for (const lineId of memberLineIds) {
      const v = actualsByLineDate.get(lineId)?.get(date);
      if (v !== undefined) {
        total += v;
        hasValue = true;
      }
    }
    return { total, hasValue };
  }

  const rows = areas.map((area) => {
    const sumTarget = (set: typeof days) =>
      set.reduce((acc, d) => acc + targetFor(area.id, d.dayOfWeek), 0);
    const sumActual = (set: typeof days) =>
      set.reduce((acc, d) => {
        const { total, hasValue } = actualFor(area.memberLineIds, d.date);
        return hasValue ? acc + total : acc;
      }, 0);
    const countWithActual = (set: typeof days) =>
      set.filter((d) => actualFor(area.memberLineIds, d.date).hasValue).length;

    const weeklyTargetTotal = sumTarget(days);
    const accruedTargetToDate = sumTarget(elapsedDays);
    const accruedActualToDate = sumActual(elapsedDays);
    const remainingTargetNormal = sumTarget(remainingDays);
    const varianceToDate = accruedActualToDate - accruedTargetToDate;
    const shortfall = Math.max(0, -varianceToDate);
    const remainingDaysCount = remainingDays.length;
    const catchUpPerDay = remainingDaysCount > 0 ? shortfall / remainingDaysCount : 0;
    const requiredDailyAvgRemaining =
      remainingDaysCount > 0 ? (remainingTargetNormal + shortfall) / remainingDaysCount : null;
    const normalRemainingDailyAvg = remainingDaysCount > 0 ? remainingTargetNormal / remainingDaysCount : null;

    const displayDivisorWeek = area.isAveraged ? 7 : 1;
    const elapsedCountWithData = area.isAveraged ? countWithActual(elapsedDays) : elapsedDays.length;
    const displayDivisorElapsed = area.isAveraged ? Math.max(elapsedCountWithData, 1) : 1;

    return {
      area,
      weeklyTarget: weeklyTargetTotal / displayDivisorWeek,
      accruedTarget: elapsedDays.length > 0 ? accruedTargetToDate / (area.isAveraged ? elapsedDays.length : 1) : null,
      accruedActual:
        elapsedDays.length > 0 && (!area.isAveraged || elapsedCountWithData > 0)
          ? accruedActualToDate / displayDivisorElapsed
          : null,
      variance: elapsedDays.length > 0 ? varianceToDate / (area.isAveraged ? Math.max(elapsedCountWithData, 1) : 1) : null,
      remainingDaysCount,
      normalRemainingDailyAvg,
      catchUpPerDay,
      requiredDailyAvgRemaining,
      isBehind: varianceToDate < -0.005,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Recovery — weekly accrual vs target</h1>
          <p className="text-sm text-neutral-500">
            {days[0].label} – {days[6].label} · as of {isCurrentWeek ? "today" : "week end"}, {remainingDays.length}{" "}
            day{remainingDays.length === 1 ? "" : "s"} left
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
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
        </div>
      </div>

      {!hasAnyTargets && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
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
