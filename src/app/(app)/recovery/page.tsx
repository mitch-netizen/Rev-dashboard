import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeRecoveryReport, type RecoveryRow, type RecoveryMemberRow } from "@/lib/revenue/recovery";
import { fetchWeekKpis } from "@/lib/revenue/week-kpis";
import { formatArea } from "@/lib/revenue/format";
import WeekShell from "../week-shell";
import ExportBar from "../export-bar";

function varianceColor(variance: number | null) {
  if (variance === null) return undefined;
  return variance < -0.005 ? "var(--qr-red-status-fg)" : "var(--qr-green-status-fg)";
}

const th = "p-2.5 text-right text-[0.72rem] font-semibold uppercase tracking-wide";
const td = "p-2 text-right";

function TargetRow({ r, subtotal, alt }: { r: RecoveryRow; subtotal?: boolean; alt?: boolean }) {
  return (
    <tr
      className="border-b"
      style={{
        borderColor: "var(--qr-line)",
        background: subtotal ? "var(--qr-total-row)" : alt ? "var(--qr-row-alt)" : undefined,
        fontWeight: subtotal ? 700 : undefined,
        borderTop: subtotal ? "2px solid var(--qr-gold)" : undefined,
      }}
    >
      <td className="sticky left-0 p-2" style={{ background: "inherit", color: "var(--qr-ink)" }}>
        {r.area.label}
      </td>
      <td className={td} style={{ color: "var(--qr-ink)" }}>
        {formatArea(r.weeklyTarget, r.area.unit)}
      </td>
      <td className={td} style={{ color: "var(--qr-ink)" }}>
        {r.accruedTarget !== null ? formatArea(r.accruedTarget, r.area.unit) : "—"}
      </td>
      <td className={td} style={{ color: "var(--qr-ink)" }}>
        {r.accruedActual !== null ? formatArea(r.accruedActual, r.area.unit) : "—"}
      </td>
      <td className={td} style={{ color: varianceColor(r.variance), fontWeight: 600 }}>
        {r.variance !== null ? `${r.variance >= 0 ? "+" : ""}${formatArea(r.variance, r.area.unit)}` : "—"}
      </td>
      {r.remainingDaysCount > 0 ? (
        <>
          <td className={td} style={{ color: "var(--qr-ink)" }}>
            {formatArea(r.normalRemainingDailyAvg ?? 0, r.area.unit)}
          </td>
          <td
            className={td}
            style={{ color: r.isBehind ? "var(--qr-red-status-fg)" : "var(--qr-ink-faint)", fontWeight: r.isBehind ? 600 : undefined }}
          >
            {r.isBehind ? `+${formatArea(r.catchUpPerDay, r.area.unit)}` : "—"}
          </td>
          <td className={td} style={{ color: "var(--qr-ink)", fontWeight: 600 }}>
            {formatArea(r.requiredDailyAvgRemaining ?? 0, r.area.unit)}
          </td>
        </>
      ) : (
        <td
          colSpan={3}
          className={td}
          style={{ color: r.isBehind ? "var(--qr-red-status-fg)" : "var(--qr-ink-faint)", fontWeight: r.isBehind ? 600 : undefined }}
        >
          {r.isBehind ? `Week complete — missed by ${formatArea(-(r.variance ?? 0), r.area.unit)}` : "Week complete"}
        </td>
      )}
    </tr>
  );
}

// A group's member line: no target of its own, so only its label and actual
// figure are shown — the rest of the row stays blank rather than a row of
// misleading "$0 target" / "on target" cells.
function MemberRow({ m }: { m: RecoveryMemberRow }) {
  return (
    <tr className="border-b" style={{ borderColor: "var(--qr-line)" }}>
      <td className="sticky left-0 py-1.5 pl-6 pr-2" style={{ background: "var(--qr-surface)", color: "var(--qr-ink-soft)" }}>
        {m.area.label}
      </td>
      <td colSpan={2}></td>
      <td className={td} style={{ color: "var(--qr-ink-soft)" }}>
        {m.accruedActual !== null ? formatArea(m.accruedActual, m.area.unit) : "—"}
      </td>
      <td colSpan={4}></td>
    </tr>
  );
}

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();

  const [{ mondayIso, days, isCurrentWeek, hasAnyTargets, sections, ungroupedRows, remainingDaysCount }, { headline }] =
    await Promise.all([computeRecoveryReport(supabase, week), fetchWeekKpis(supabase, week)]);

  return (
    <WeekShell
      active="recovery"
      mondayIso={mondayIso}
      isCurrentWeek={isCurrentWeek}
      kpis={headline}
      actions={<ExportBar excelHref={`/api/export/recovery?week=${mondayIso}`} />}
    >
      <p className="text-sm print:hidden" style={{ color: "var(--qr-ink-soft)" }}>
        As of {isCurrentWeek ? "today" : "week end"} · {remainingDaysCount} day{remainingDaysCount === 1 ? "" : "s"} left in{" "}
        {days[0].label} – {days[6].label}
      </p>

      {!hasAnyTargets && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 print:hidden">
          No targets are set up yet, so this report has nothing to compare against.{" "}
          <Link href="/targets" className="underline">
            Set up targets
          </Link>{" "}
          first.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--qr-line)" }}>
        <table className="w-full min-w-[1000px] border-collapse text-sm" style={{ background: "var(--qr-surface)" }}>
          <thead>
            <tr>
              <th className="sticky left-0 p-2.5 text-left text-[0.72rem] font-semibold uppercase tracking-wide" style={{ background: "var(--qr-green-table)", color: "#f5f0e6" }}>
                Area
              </th>
              {["Weekly target", "Target to date", "Actual to date", "Variance", "Normal daily target (rest of week)", "Extra needed per day", "New required daily target"].map(
                (label) => (
                  <th key={label} className={th} style={{ background: "var(--qr-green-table)", color: "#f5f0e6" }}>
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {sections.map((section, i) =>
              section.kind === "standalone" ? (
                <TargetRow key={section.row.area.id} r={section.row} alt={i % 2 === 1} />
              ) : (
                <Fragment key={section.group.row.area.id}>
                  {section.group.members.map((m) => (
                    <MemberRow key={m.area.id} m={m} />
                  ))}
                  <TargetRow r={section.group.row} subtotal />
                </Fragment>
              )
            )}
          </tbody>
        </table>
      </div>

      {ungroupedRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--qr-line)" }}>
          <p className="p-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--qr-ink-faint)" }}>
            No target set
          </p>
          <table className="w-full min-w-[1000px] border-collapse text-sm" style={{ background: "var(--qr-surface)" }}>
            <tbody>
              {ungroupedRows.map((m) => (
                <tr key={m.area.id} className="border-b" style={{ borderColor: "var(--qr-line)" }}>
                  <td className="sticky left-0 w-1/4 p-2" style={{ background: "var(--qr-surface)", color: "var(--qr-ink-soft)" }}>
                    {m.area.label}
                  </td>
                  <td className={td} style={{ color: "var(--qr-ink-soft)" }}>
                    {m.accruedActual !== null ? formatArea(m.accruedActual, m.area.unit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WeekShell>
  );
}
