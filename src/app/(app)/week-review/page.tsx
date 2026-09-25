import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchWeeklyReportData, type HeadlineRow } from "@/lib/revenue/weekly-report";
import { abbreviateLineLabel, formatArea, formatSigned } from "@/lib/revenue/format";
import WeekShell from "../week-shell";
import PrintButton from "./print-button";
import styles from "./report.module.css";

function TrendLabel({ row }: { row: HeadlineRow }) {
  if (row.trend === null) {
    return <div className={styles.targetLine}>No prior week data</div>;
  }
  const up = row.trend >= 0;
  const suffix = row.area.isAveraged ? "pp" : "%";
  return (
    <div className={`${styles.trend} ${up ? styles.up : styles.down}`}>
      {up ? "▲ +" : "▼ −"}
      {Math.abs(row.trend).toFixed(1)}
      {suffix}
      <span className={styles.trendLabel}> vs last week</span>
    </div>
  );
}

function VarianceLine({ row }: { row: HeadlineRow }) {
  if (row.variance === null) return null;
  const up = row.variance >= 0;
  return (
    <div className={`${styles.trend} ${up ? styles.up : styles.down}`}>
      {formatSigned(row.variance, row.area.unit)}
    </div>
  );
}

function TargetProgress({ row }: { row: HeadlineRow }) {
  if (row.weeklyTarget === null) {
    return <div className={styles.targetLine}>No target set</div>;
  }
  if (row.actual === null || row.weeklyTarget === 0) {
    return <div className={styles.targetLine}>—</div>;
  }
  const pct = Math.round((row.actual / row.weeklyTarget) * 100);
  return <div className={styles.targetLine}>{pct}% to target</div>;
}

export default async function WeekReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const data = await fetchWeeklyReportData(supabase, week);
  const { mondayIso, isCurrentWeek, weekClosed, days, daysReported, generatedLabel, hasAnyTargets, lines, actuals, headline, targetsByHeadlineDay } =
    data;

  return (
    <WeekShell active="review" mondayIso={mondayIso} isCurrentWeek={isCurrentWeek} kpis={headline} actions={<PrintButton />}>
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
              Weekly Revenue Report — Week Commencing{" "}
              {new Date(`${mondayIso}T00:00:00Z`).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
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
              <VarianceLine row={row} />
              <TargetProgress row={row} />
            </div>
          ))}
        </div>

        <section className={styles.block}>
          <h2>Week-over-Week Trend</h2>
          <div className={styles.trendGrid}>
            {headline.map((row) => (
              <div key={row.area.id} className={styles.trendCard}>
                <div className={styles.label}>{row.area.label}</div>
                <TrendLabel row={row} />
              </div>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <h2>Daily Actuals — Monday to Sunday</h2>
          <div className={`${styles.tableScroll} ${styles.dailyActualsScroll}`}>
            <table className={styles.dailyActualsTable}>
              <thead>
                <tr>
                  <th>Day</th>
                  {lines.map((line) => (
                    <th key={line.id}>{abbreviateLineLabel(line.label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.label}</td>
                    {lines.map((line) => {
                      const value = actuals[`${d.date}|${line.id}`];
                      return <td key={line.id}>{value !== undefined ? formatArea(value, line.unit, 0) : "—"}</td>;
                    })}
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>Week Total / Avg</td>
                  {lines.map((line) => (
                    <td key={line.id}>{line.weekTotal !== null ? formatArea(line.weekTotal, line.unit, 0) : "—"}</td>
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
          Source: SwiftPOS Sales Exc GST · Maxgaming Daily Report (Gaming) · RMS Occupancy By No Group (Accommodation Revenue, ADR, Occ % — Occ % and ADR are rates, always averaged). Targets carried forward from the standing pattern.
        </footer>
      </div>
    </WeekShell>
  );
}
