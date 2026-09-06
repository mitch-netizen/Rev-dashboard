"use client";

import { useState, useTransition } from "react";
import { upsertDailyActual } from "./actions";

export interface WeekGridLine {
  id: string;
  label: string;
  unit: "currency" | "percent";
}

export interface WeekGridDay {
  date: string; // ISO
  label: string; // e.g. "Mon 1 Sep"
}

export default function WeekGrid({
  days,
  lines,
  actuals,
}: {
  days: WeekGridDay[];
  lines: WeekGridLine[];
  actuals: Record<string, number>; // key = `${date}|${lineId}`
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border-b border-neutral-200 bg-white p-2 text-left font-medium dark:border-neutral-800 dark:bg-neutral-900">
              Revenue line
            </th>
            {days.map((d) => (
              <th
                key={d.date}
                className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800"
              >
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="sticky left-0 bg-white p-2 text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                {line.label}
              </td>
              {days.map((d) => {
                const key = keyFor(d.date, line.id);
                const value = values[key];
                return (
                  <td key={d.date} className="p-1 text-right">
                    <input
                      defaultValue={value ?? ""}
                      onBlur={(e) => handleCommit(d.date, line.id, e.target.value)}
                      placeholder="—"
                      inputMode="decimal"
                      className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right hover:border-neutral-300 focus:border-neutral-400 focus:bg-neutral-50 focus:outline-none dark:hover:border-neutral-700 dark:focus:bg-neutral-900"
                    />
                    {line.unit === "percent" && value !== undefined ? "%" : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {isPending && <p className="mt-2 text-xs text-neutral-400">Saving…</p>}
    </div>
  );
}
