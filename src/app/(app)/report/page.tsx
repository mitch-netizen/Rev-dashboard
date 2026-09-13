import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, toIsoDate } from "@/lib/revenue/constants";
import { fetchWeeklyReportData, type HeadlineRow } from "@/lib/revenue/weekly-report";
import PrintButton from "./print-button";
import styles from "./report.module.css";

function formatCurrency(value: number, fractionDigits = 0) {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatArea(value: number, unit: "currency" | "percent", fractionDigits = 0) {
  return unit === "percent" ? `${value.toFixed(1)}%` : formatCurrency(value, fractionDigits);
}

function formatSigned(value: number, unit: "currency" | "percent") {
  const sign = value >= 0 ? "+" : "";
  return unit === "percent" ? `${sign}${value.toFixed(1)}pp` : `${sign}${formatCurrency(value, 0)}`;
}

function TrendLabel({ row }: { row: HeadlineRow }) {
  if (row.trend === null) return null;
  const up = row.trend >= 0;
  const suffix = row.area.isAveraged ? "pp" : "%";
  return (
    <div className={`${styles.trend} ${up ? styles.up : styles.down}`}>
      {up ? "▲ +" : "▼ −"}
      {Math.abs(row.trend).toFixed(1)}
      {suffix}
    </div>
  );
}

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const data = await fetchWeeklyReportData(supabase, week);
  const { monday, isCurrentWeek, weekClosed, days, daysReported, generatedLabel, hasAnyTargets, lines, actuals, headline, targetsByHeadlineDay } =
    data;

  const prevWeek = toIsoDate(addDays(monday, -7));
  const nextWeek = toIsoDate(addDays(monday, 7));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Weekly Report</h1>
          <p className="text-sm text-neutral-500">
            {days[0].label} – {days[6].label}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/report?week=${prevWeek}`} className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
            ← Previous week
          </Link>
          {!isCurrentWeek && (
            <Link href="/report" className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
              This week
            </Link>
          )}
          <Link href={`/report?week=${nextWeek}`} className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
            Next week →
          </Link>
          <PrintButton />
        </div>
      </div>

      {!hasAnyTargets && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 print:hidden">
          No targets are set up yet, so this report has nothing to compare against.{" "}
          <Link href="/targets" className="underline">
            Set up targets
          </Link>{" "}
          first.
        </div>
      )}

      <div className={styles.page}>
        <header className={styles.reportHeader}>
          <div>
            <h1>The Queens Hotel Gladstone</h1>
            <div className={styles.subtitle}>
              Weekly Revenue Report — Week Commencing {monday.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
            </div>
          </div>
          <div className={styles.status}>
            <div>
              <strong>{weekClosed ? "Week closed" : "Week in progress"}</strong> · {daysReported} of 7 days reported
            </div>
            <div>Report generated {generatedLabel}</div>
          </div>
        </header>

        <div className={styles.statGrid}>
          {headline.map((row) => (
            <div key={row.area.id} className={`${styles.statCard} ${row.isBehind ? styles.short : ""}`}>
              <div className={styles.label}>{row.area.label}</div>
              <div className={styles.value}>{row.actual !== null ? formatArea(row.actual, row.area.unit) : "—"}</div>
              <TrendLabel row={row} />
              <div className={styles.targetLine}>
                {row.weeklyTarget !== null ? `vs ${formatArea(row.weeklyTarget, row.area.unit)} target` : "No target set"}
              </div>
            </div>
          ))}
        </div>

        <section className={styles.block}>
          <h2>Daily Actuals — Monday to Sunday</h2>
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  {lines.map((line) => (
                    <th key={line.id}>{line.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.label}</td>
                    {lines.map((line) => {
                      const value = actuals[`${d.date}|${line.id}`];
                      return <td key={line.id}>{value !== undefined ? formatArea(value, line.unit, 2) : "—"}</td>;
                    })}
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>Week Total / Avg</td>
                  {lines.map((line) => (
                    <td key={line.id}>{line.weekTotal !== null ? formatArea(line.weekTotal, line.unit, 2) : "—"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.twoCol}>
          <section className={styles.block}>
            <h2>Group Summary — Week to Date</h2>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Revenue Line</th>
                    <th>Target</th>
                    <th>Actual</th>
                    <th>Variance</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {headline.map((row) => (
                    <tr key={row.area.id}>
                      <td className={styles.lineLabel}>{row.area.label}</td>
                      <td>{row.weeklyTarget !== null ? formatArea(row.weeklyTarget, row.area.unit) : "—"}</td>
                      <td>{row.actual !== null ? formatArea(row.actual, row.area.unit) : "—"}</td>
                      <td>{row.variance !== null ? formatSigned(row.variance, row.area.unit) : "—"}</td>
                      <td>
                        {row.variance !== null ? (
                          <span className={`${styles.statusPill} ${row.isBehind ? styles.short : styles.on}`}>
                            {row.isBehind ? "Short" : "On target"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.block}>
            <h2>Targets Set This Week — Monday to Sunday</h2>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    {headline.map((row) => (
                      <th key={row.area.id}>{row.area.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td>{d.label}</td>
                      {headline.map((row) => (
                        <td key={row.area.id}>
                          {formatArea(targetsByHeadlineDay[row.area.id]?.[d.dayOfWeek] ?? 0, row.area.unit)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer className={styles.sourceNote}>
          Source: SwiftPOS Sales Exc GST · Net Meter (Gaming) · RMS Occupancy (Accommodation is a rate, always averaged). Targets carried forward from the standing pattern.
        </footer>
      </div>
    </div>
  );
}
