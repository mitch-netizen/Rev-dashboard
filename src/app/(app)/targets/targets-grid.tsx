"use client";

import { useState, useTransition } from "react";
import { upsertStandingTarget } from "./actions";
import { DAY_LABELS } from "@/lib/revenue/constants";
import type { Area } from "@/lib/revenue/targets";

export default function TargetsGrid({
  areas,
  targets,
}: {
  areas: Area[];
  targets: Record<string, number>; // key = `${areaId}|${dayOfWeek}`
}) {
  const [values, setValues] = useState(targets);
  const [isPending, startTransition] = useTransition();

  function keyFor(areaId: string, day: number) {
    return `${areaId}|${day}`;
  }

  function handleCommit(area: Area, day: number, raw: string) {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) return;

    const key = keyFor(area.id, day);
    setValues((prev) => {
      const next = { ...prev };
      if (parsed === null) delete next[key];
      else next[key] = parsed;
      return next;
    });

    startTransition(() => {
      upsertStandingTarget(
        area.kind === "line" ? { revenueLineId: area.id, groupId: null } : { revenueLineId: null, groupId: area.id },
        day,
        parsed
      );
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border-b border-neutral-200 bg-white p-2 text-left font-medium dark:border-neutral-800 dark:bg-neutral-900">
              Area
            </th>
            {DAY_LABELS.map((label) => (
              <th
                key={label}
                className="border-b border-neutral-200 p-2 text-right font-medium dark:border-neutral-800"
              >
                {label.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => (
            <tr
              key={area.id}
              className={`border-b border-neutral-100 dark:border-neutral-900 ${
                area.kind === "group" ? "bg-neutral-50 font-medium dark:bg-neutral-900/40" : ""
              }`}
            >
              <td className="sticky left-0 bg-inherit p-2 text-neutral-700 dark:text-neutral-300">
                {area.label}
                {area.unit === "percent" ? " (%)" : null}
              </td>
              {DAY_LABELS.map((_, day) => {
                const key = keyFor(area.id, day);
                const value = values[key];
                return (
                  <td key={day} className="p-1 text-right">
                    <input
                      defaultValue={value ?? ""}
                      onBlur={(e) => handleCommit(area, day, e.target.value)}
                      placeholder="—"
                      inputMode="decimal"
                      className="w-20 rounded border border-transparent bg-transparent px-2 py-1 text-right hover:border-neutral-300 focus:border-neutral-400 focus:bg-neutral-50 focus:outline-none dark:hover:border-neutral-700 dark:focus:bg-neutral-900"
                    />
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
