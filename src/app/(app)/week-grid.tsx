"use client";

import { useMemo, useState, useTransition } from "react";
import { upsertDailyActual } from "./actions";
import { formatArea } from "@/lib/revenue/format";

export interface WeekGridLine {
  id: string;
  label: string;
  unit: "currency" | "percent" | "count";
  isAveraged: boolean;
}

export interface WeekGridDay {
  date: string; // ISO
  label: string; // e.g. "Mon 1 Sep"
}

function weekToDateFor(line: WeekGridLine, days: WeekGridDay[], values: Record<string, number>): number | null {
  const present = days.map((d) => values[`${d.date}|${line.id}`]).filter((v): v is number => v !== undefined);
  if (present.length === 0) return null;
  const sum = present.reduce((a, b) => a + b, 0);
  return line.isAveraged ? sum / present.length : sum;
}

export default function WeekGrid({
  days,
  lines,
  actuals,
  todayIso,
}: {
  days: WeekGridDay[];
  lines: WeekGridLine[];
  actuals: Record<string, number>; // key = `${date}|${lineId}`
  todayIso: string;
}) {
  const [values, setValues] = useState(actuals);
  const [isPending, startTransition] = useTransition();

  function keyFor(date: string, lineId: string) {
    return `${date}|${lineId}`;
  }

  function handleCommit(date: string, lineId: string, raw: string) {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) return;

    const key = keyFor(date, lineId);
    setValues((prev) => {
      const next = { ...prev };
      if (parsed === null) delete next[key];
      else next[key] = parsed;
      return next;
    });

    startTransition(() => {
      upsertDailyActual(date, lineId, parsed);
    });
  }

  const weekTotals = useMemo(
    () => Object.fromEntries(lines.map((line) => [line.id, weekToDateFor(line, days, values)])),
    [lines, days, values]
  );

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--qr-line)" }}>
      <table className="w-full min-w-[980px] border-collapse text-sm" style={{ background: "var(--qr-surface)" }}>
        <thead>
          <tr>
            <th
              className="sticky left-0 p-2.5 text-left text-[0.72rem] font-semibold uppercase tracking-wide"
              style={{ background: "var(--qr-green-table)", color: "#f5f0e6" }}
            >
              Revenue line
            </th>
            {days.map((d) => (
              <th
                key={d.date}
                className="p-2.5 text-right text-[0.72rem] font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--qr-green-table)",
                  color: d.date === todayIso ? "var(--qr-gold-soft)" : "#f5f0e6",
                }}
              >
                {d.label}
              </th>
            ))}
            <th
              className="border-l p-2.5 text-right text-[0.72rem] font-semibold uppercase tracking-wide"
              style={{ background: "var(--qr-green-table)", color: "var(--qr-gold-soft)", borderColor: "var(--qr-line)" }}
            >
              Week to date
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const weekTotal = weekTotals[line.id];
            return (
              <tr
                key={line.id}
                className="border-b"
                style={{ borderColor: "var(--qr-line)", background: i % 2 === 1 ? "var(--qr-row-alt)" : "transparent" }}
              >
                <td
                  className="sticky left-0 p-2"
                  style={{ background: i % 2 === 1 ? "var(--qr-row-alt)" : "var(--qr-surface)", color: "var(--qr-ink)" }}
                >
                  {line.label}
                </td>
                {days.map((d) => {
                  const key = keyFor(d.date, line.id);
                  const value = values[key];
                  return (
                    <td key={d.date} className="p-1 text-right" style={{ background: d.date === todayIso ? "var(--qr-gold-soft)" : undefined }}>
                      <input
                        defaultValue={value ?? ""}
                        onBlur={(e) => handleCommit(d.date, line.id, e.target.value)}
                        placeholder="—"
                        inputMode="decimal"
                        className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right focus:border-[var(--qr-gold)] focus:outline-none"
                        style={{ color: "var(--qr-ink)" }}
                      />
                      {line.unit === "percent" && value !== undefined ? "%" : null}
                    </td>
                  );
                })}
                <td
                  className="border-l p-2 text-right font-semibold"
                  style={{ borderColor: "var(--qr-line)", color: "var(--qr-ink)" }}
                >
                  {weekTotal !== null ? formatArea(weekTotal, line.unit, 2) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isPending && (
        <p className="px-2 py-2 text-xs" style={{ color: "var(--qr-ink-soft)" }}>
          Saving…
        </p>
      )}
    </div>
  );
}
