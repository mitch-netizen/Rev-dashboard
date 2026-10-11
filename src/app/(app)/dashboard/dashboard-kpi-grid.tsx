import { formatArea, formatSigned } from "@/lib/revenue/format";
import type { WeeklyReportKpiGroup, WeeklyReportKpiRow } from "@/lib/revenue/weekly-report-kpis";

function Delta({ label, delta, pct, unit }: { label: string; delta: number | null; pct: number | null; unit: WeeklyReportKpiRow["area"]["unit"] }) {
  if (delta === null) {
    return (
      <div className="text-xs" style={{ color: "var(--qr-ink-faint)" }}>
        {label}: —
      </div>
    );
  }
  const up = delta >= 0;
  return (
    <div className="text-xs" style={{ color: "var(--qr-ink-soft)" }}>
      {label}:{" "}
      <span className="font-semibold" style={{ color: up ? "var(--qr-green-status-fg)" : "var(--qr-red-status-fg)" }}>
        {up ? "▲" : "▼"} {formatSigned(delta, unit).replace(/^[+-]/, "")}
      </span>
      {pct !== null && <span> ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
    </div>
  );
}

function DashboardKpiTile({ row }: { row: WeeklyReportKpiRow }) {
  const borderColor =
    row.met === true ? "var(--qr-green-status-fg)" : row.met === false ? "var(--qr-red)" : "var(--qr-gold)";
  return (
    <div
      className="min-w-[200px] flex-1 rounded-none border p-4"
      style={{ background: "var(--qr-card-bg)", borderColor: "var(--qr-line)", borderLeft: `5px solid ${borderColor}` }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--qr-ink-soft)" }}>
        {row.area.label}
      </div>
      <div className="font-display mt-1 text-2xl font-bold" style={{ color: "var(--qr-ink)" }}>
        {row.actual !== null ? formatArea(row.actual, row.area.unit) : "—"}
      </div>
      <div className="text-xs" style={{ color: "var(--qr-ink-faint)" }}>
        {row.target !== null ? `Target ${formatArea(row.target, row.area.unit)}` : "No target set"}
        {row.variance !== null && (
          <span className="ml-1" style={{ color: row.met ? "var(--qr-green-status-fg)" : "var(--qr-red-status-fg)" }}>
            {formatSigned(row.variance, row.area.unit)}
          </span>
        )}
      </div>
      <div className="mt-2.5 space-y-1 border-t pt-2" style={{ borderColor: "var(--qr-line)" }}>
        <Delta label="vs last wk" delta={row.vsLastWeekDelta} pct={row.vsLastWeekPct} unit={row.area.unit} />
        <Delta label="vs 4-wk avg" delta={row.vs4WeekAvgDelta} pct={row.vs4WeekAvgPct} unit={row.area.unit} />
      </div>
    </div>
  );
}

export default function DashboardKpiGrid({ groups }: { groups: WeeklyReportKpiGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--qr-ink-faint)" }}>
        No KPI data available for this week yet.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="font-display mb-2 text-sm font-bold" style={{ color: "var(--qr-ink)" }}>
            {group.label}
          </div>
          <div className="flex flex-wrap gap-3">
            {group.rows.map((row) => (
              <DashboardKpiTile key={row.area.id} row={row} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
