"use client";

import { useState, useTransition } from "react";
import { saveWeeklyReportField } from "./actions";
import { WEEKLY_REPORT_SECTIONS } from "@/lib/revenue/weekly-report-fields";
import { formatArea, formatSigned } from "@/lib/revenue/format";
import type { WeeklyReportKpiGroup, WeeklyReportKpiRow } from "@/lib/revenue/weekly-report-kpis";

function ComparisonLine({ label, delta, pct, unit }: { label: string; delta: number | null; pct: number | null; unit: WeeklyReportKpiRow["area"]["unit"] }) {
  if (delta === null) {
    return (
      <div className="text-[0.68rem]" style={{ color: "var(--qr-ink-faint)" }}>
        {label}: —
      </div>
    );
  }
  const up = delta >= 0;
  return (
    <div className="text-[0.68rem]" style={{ color: "var(--qr-ink-soft)" }}>
      {label}:{" "}
      <span className="font-semibold" style={{ color: up ? "var(--qr-green-status-fg)" : "var(--qr-red-status-fg)" }}>
        {up ? "▲" : "▼"} {formatSigned(delta, unit).replace(/^[+-]/, "")}
      </span>
      {pct !== null && <span> ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
    </div>
  );
}

function KpiRefCard({ row }: { row: WeeklyReportKpiRow }) {
  const borderColor =
    row.met === true ? "var(--qr-green-status-fg)" : row.met === false ? "var(--qr-red)" : "var(--qr-line)";
  return (
    <div
      className="min-w-[170px] flex-1 rounded-lg border p-3"
      style={{ background: "var(--qr-card-bg)", borderColor: "var(--qr-line)", borderLeft: `4px solid ${borderColor}` }}
    >
      <div className="text-[0.66rem] font-semibold uppercase tracking-wide" style={{ color: "var(--qr-ink-soft)" }}>
        {row.area.label}
      </div>
      <div className="font-display mt-1 text-lg font-bold" style={{ color: "var(--qr-ink)" }}>
        {row.actual !== null ? formatArea(row.actual, row.area.unit) : "—"}
      </div>
      <div className="text-[0.7rem]" style={{ color: "var(--qr-ink-faint)" }}>
        {row.target !== null ? `Target ${formatArea(row.target, row.area.unit)}` : "No target set"}
        {row.variance !== null && (
          <span className="ml-1" style={{ color: row.met ? "var(--qr-green-status-fg)" : "var(--qr-red-status-fg)" }}>
            {formatSigned(row.variance, row.area.unit)}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-0.5 border-t pt-1.5" style={{ borderColor: "var(--qr-line)" }}>
        <ComparisonLine label="vs last wk" delta={row.vsLastWeekDelta} pct={row.vsLastWeekPct} unit={row.area.unit} />
        <ComparisonLine label="vs 4-wk avg" delta={row.vs4WeekAvgDelta} pct={row.vs4WeekAvgPct} unit={row.area.unit} />
      </div>
    </div>
  );
}

function FieldInput({
  id,
  type,
  value,
  onCommit,
}: {
  id: string;
  type: "text" | "textarea" | "date";
  value: string;
  onCommit: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const shared = "w-full rounded-md border px-3 py-2 text-sm focus:outline-none";
  const style = { background: "var(--qr-card-bg)", borderColor: "var(--qr-line)", color: "var(--qr-ink)" };

  if (type === "textarea") {
    return (
      <textarea
        id={id}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        rows={3}
        className={`${shared} resize-y`}
        style={style}
      />
    );
  }
  return (
    <input
      id={id}
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      className={shared}
      style={style}
    />
  );
}

export default function WeeklyReportNotesForm({
  weekId,
  initialAnswers,
  kpiGroups,
  weekEndingDefault,
}: {
  weekId: string;
  initialAnswers: Record<string, string>;
  kpiGroups: WeeklyReportKpiGroup[];
  weekEndingDefault: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({
    department: "All departments",
    week_ending: weekEndingDefault,
    ...initialAnswers,
  }));
  const [isPending, startTransition] = useTransition();

  function commit(field: string, value: string) {
    setAnswers((prev) => ({ ...prev, [field]: value }));
    startTransition(() => {
      saveWeeklyReportField(weekId, field, value);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--qr-ink-soft)" }}>
        Drop in rough notes, not full answers — these are the dot points Claude will draft the full Weekly Management
        Report write-up from, with the figures below folded in automatically.
      </p>

      <nav className="flex flex-wrap gap-1 border-b pb-2 text-sm" style={{ borderColor: "var(--qr-line)" }}>
        {WEEKLY_REPORT_SECTIONS.filter((s) => s.id !== "accounts").map((s) => (
          <a
            key={s.id}
            href={`#wr-${s.id}`}
            className="rounded-md px-2.5 py-1 hover:opacity-80"
            style={{ color: "var(--qr-ink-soft)" }}
          >
            {s.label}
          </a>
        ))}
      </nav>

      {WEEKLY_REPORT_SECTIONS.map((section) => (
        <div
          key={section.id}
          id={`wr-${section.id}`}
          className="scroll-mt-4 rounded-lg border p-4 sm:p-5"
          style={{ background: "var(--qr-surface)", borderColor: "var(--qr-line)" }}
        >
          <h2 className="font-display text-base font-bold" style={{ color: "var(--qr-ink)" }}>
            {section.label}
          </h2>

          {section.id === "results" && (
            <div className="mt-3 mb-4 space-y-3">
              {kpiGroups.map((group) => (
                <div key={group.label}>
                  <div className="mb-1.5 text-sm font-semibold" style={{ color: "var(--qr-ink)" }}>
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {group.rows.map((row) => (
                      <KpiRefCard key={row.area.id} row={row} />
                    ))}
                  </div>
                </div>
              ))}
              {kpiGroups.length === 0 && (
                <p className="text-sm" style={{ color: "var(--qr-ink-faint)" }}>
                  No KPI data available for this week yet.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 space-y-3">
            {section.fields.map((field) => (
              <div key={field.id}>
                <label
                  htmlFor={field.id}
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--qr-ink-soft)" }}
                >
                  {field.label}
                </label>
                <FieldInput
                  id={field.id}
                  type={field.type}
                  value={answers[field.id] ?? ""}
                  onCommit={(value) => commit(field.id, value)}
                />
                {field.hint && (
                  <p className="mt-1 text-xs" style={{ color: "var(--qr-ink-faint)" }}>
                    {field.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs" style={{ color: "var(--qr-ink-faint)" }}>
        {isPending ? "Saving…" : "Saved — every field autosaves when you click away from it."}
      </p>
    </div>
  );
}
