"use client";

import { Fragment, useState, useTransition } from "react";
import { upsertStandingTarget, upsertStandingTargetsBulk } from "./actions";
import { DAY_LABELS } from "@/lib/revenue/constants";
import {
  distributeWeeklyTotal,
  distributeMonthlyForecast,
  countWeekdaysInMonth,
  EQUAL_WEIGHTS,
  type DayOfWeekWeights,
} from "@/lib/revenue/target-distribution";
import type { Area } from "@/lib/revenue/targets";

type StandingTargetOf = { revenueLineId: string; groupId: null } | { revenueLineId: null; groupId: string };

function targetFor(area: Area): StandingTargetOf {
  return area.kind === "line" ? { revenueLineId: area.id, groupId: null } : { revenueLineId: null, groupId: area.id };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatAmount(value: number, unit: "currency" | "percent"): string {
  return unit === "percent" ? `${value.toFixed(1)}%` : value.toLocaleString("en-AU", { maximumFractionDigits: 0 });
}

export default function TargetsGrid({
  areas,
  targets,
  weights,
  lastWeek,
}: {
  areas: Area[];
  targets: Record<string, number>; // key = `${areaId}|${dayOfWeek}`
  weights: Record<string, DayOfWeekWeights>;
  lastWeek: Record<string, (number | null)[]>; // areaId -> Monday..Sunday, null = no actual recorded
}) {
  const [values, setValues] = useState(targets);
  const [isPending, startTransition] = useTransition();
  const [openForecastAreaId, setOpenForecastAreaId] = useState<string | null>(null);
  const [forecastMonth, setForecastMonth] = useState(currentMonthValue);
  const [forecastAmount, setForecastAmount] = useState("");

  function keyFor(areaId: string, day: number) {
    return `${areaId}|${day}`;
  }

  function applyAmounts(area: Area, amounts: (number | null | undefined)[]) {
    setValues((prev) => {
      const next = { ...prev };
      amounts.forEach((amount, day) => {
        if (amount === undefined) return;
        const key = keyFor(area.id, day);
        if (amount === null) delete next[key];
        else next[key] = amount;
      });
      return next;
    });
    startTransition(() => {
      upsertStandingTargetsBulk(targetFor(area), amounts);
    });
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
      upsertStandingTarget(targetFor(area), day, parsed);
    });
  }

  function weekTotalFor(area: Area): number | null {
    const present = Array.from({ length: 7 }, (_, d) => values[keyFor(area.id, d)]).filter(
      (v): v is number => v !== undefined
    );
    if (present.length === 0) return null;
    const sum = present.reduce((a, b) => a + b, 0);
    return area.isAveraged ? sum / present.length : sum;
  }

  function handleWeekTotalCommit(area: Area, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") return; // Week total only fills forward — clear individual days to remove a target
    const total = Number(trimmed);
    if (Number.isNaN(total)) return;

    const amounts = area.isAveraged
      ? Array(7).fill(round2(total))
      : distributeWeeklyTotal(total, weights[area.id] ?? EQUAL_WEIGHTS);
    applyAmounts(area, amounts);
  }

  function handleFillWeek(area: Area) {
    const monday = values[keyFor(area.id, 0)];
    const source = monday ?? Array.from({ length: 7 }, (_, d) => values[keyFor(area.id, d)]).find((v) => v !== undefined);
    if (source === undefined) return;
    applyAmounts(area, Array(7).fill(source));
  }

  function handleCopyLastWeek(area: Area) {
    const source = lastWeek[area.id] ?? [null, null, null, null, null, null, null];
    const amounts = source.map((v) => (v === null ? undefined : round2(v)));
    applyAmounts(area, amounts);
  }

  function forecastPreview(area: Area): number[] | null {
    const total = Number(forecastAmount.trim());
    if (forecastAmount.trim() === "" || Number.isNaN(total)) return null;
    const match = /^(\d{4})-(\d{2})$/.exec(forecastMonth);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);

    if (area.isAveraged) return Array(7).fill(round2(total));
    const weekdayCounts = countWeekdaysInMonth(year, month);
    return distributeMonthlyForecast(total, weights[area.id] ?? EQUAL_WEIGHTS, weekdayCounts);
  }

  function applyForecast(area: Area) {
    const preview = forecastPreview(area);
    if (!preview) return;
    applyAmounts(area, preview);
    setOpenForecastAreaId(null);
    setForecastAmount("");
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
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
            <th className="border-b border-l border-neutral-200 p-2 text-right font-medium dark:border-neutral-800">
              Week
            </th>
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => {
            const hasLastWeek = (lastWeek[area.id] ?? []).some((v) => v !== null);
            const weekTotal = weekTotalFor(area);
            const forecastOpen = openForecastAreaId === area.id;
            const preview = forecastOpen ? forecastPreview(area) : null;

            return (
              <Fragment key={area.id}>
                <tr
                  className={`border-b border-neutral-100 dark:border-neutral-900 ${
                    area.kind === "group" ? "bg-neutral-50 font-medium dark:bg-neutral-900/40" : ""
                  }`}
                >
                  <td className="sticky left-0 bg-inherit p-2 align-top text-neutral-700 dark:text-neutral-300">
                    <div>
                      {area.label}
                      {area.unit === "percent" ? " (%)" : null}
                    </div>
                    <div className="mt-1 flex gap-2 text-[11px] font-normal text-neutral-400">
                      <button
                        type="button"
                        onClick={() => handleFillWeek(area)}
                        className="underline decoration-dotted hover:text-neutral-600 dark:hover:text-neutral-300"
                        title="Fill every day with Monday's value"
                      >
                        Fill week
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyLastWeek(area)}
                        disabled={!hasLastWeek}
                        className="underline decoration-dotted hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline dark:hover:text-neutral-300"
                        title="Copy last week's actuals in as this week's targets"
                      >
                        Copy last wk
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenForecastAreaId(forecastOpen ? null : area.id);
                          setForecastAmount("");
                        }}
                        className="underline decoration-dotted hover:text-neutral-600 dark:hover:text-neutral-300"
                        title="Set a monthly forecast and spread it across weekdays"
                      >
                        Forecast…
                      </button>
                    </div>
                  </td>
                  {DAY_LABELS.map((_, day) => {
                    const key = keyFor(area.id, day);
                    const value = values[key];
                    return (
                      <td key={day} className="p-1 text-right">
                        <input
                          key={value ?? "empty"}
                          defaultValue={value ?? ""}
                          onBlur={(e) => handleCommit(area, day, e.target.value)}
                          placeholder="—"
                          inputMode="decimal"
                          className="w-20 rounded border border-transparent bg-transparent px-2 py-1 text-right hover:border-neutral-300 focus:border-neutral-400 focus:bg-neutral-50 focus:outline-none dark:hover:border-neutral-700 dark:focus:bg-neutral-900"
                        />
                      </td>
                    );
                  })}
                  <td className="border-l border-neutral-100 p-1 text-right dark:border-neutral-900">
                    <input
                      key={weekTotal ?? "empty"}
                      defaultValue={weekTotal === null ? "" : round2(weekTotal)}
                      onBlur={(e) => handleWeekTotalCommit(area, e.target.value)}
                      placeholder="—"
                      inputMode="decimal"
                      title={area.isAveraged ? "Average target for the week — sets every day to this value" : "Weekly total — spread across days by historical day-of-week mix"}
                      className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right font-medium hover:border-neutral-300 focus:border-neutral-400 focus:bg-neutral-50 focus:outline-none dark:hover:border-neutral-700 dark:focus:bg-neutral-900"
                    />
                  </td>
                </tr>
                {forecastOpen && (
                  <tr key={`${area.id}-forecast`} className="border-b border-neutral-100 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900/60">
                    <td colSpan={9} className="p-3">
                      <div className="flex flex-wrap items-end gap-3 text-xs">
                        <label className="flex flex-col gap-1 text-neutral-500">
                          Month
                          <input
                            type="month"
                            value={forecastMonth}
                            onChange={(e) => setForecastMonth(e.target.value)}
                            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-neutral-500">
                          {area.isAveraged ? "Monthly target (avg %)" : "Monthly forecast ($)"}
                          <input
                            inputMode="decimal"
                            autoFocus
                            value={forecastAmount}
                            onChange={(e) => setForecastAmount(e.target.value)}
                            className="w-32 rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => applyForecast(area)}
                          disabled={!preview}
                          className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenForecastAreaId(null)}
                          className="px-2 py-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                        >
                          Cancel
                        </button>
                        {preview && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-neutral-500">
                            {DAY_LABELS.map((label, i) => (
                              <span key={label}>
                                {label.slice(0, 3)} {formatAmount(preview[i], area.unit)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {isPending && <p className="mt-2 text-xs text-neutral-400">Saving…</p>}
    </div>
  );
}
