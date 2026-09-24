"use client";

import { Fragment, useState, useTransition } from "react";
import { upsertStandingTarget, upsertStandingTargetsBulk } from "./actions";
import { DAY_LABELS } from "@/lib/revenue/constants";
import { formatArea } from "@/lib/revenue/format";
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

const actionBtn =
  "underline decoration-dotted hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 disabled:no-underline";

export default function StandingTargetsGrid({
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
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--qr-line)" }}>
      <table className="w-full min-w-[1120px] border-collapse text-sm" style={{ background: "var(--qr-surface)" }}>
        <thead>
          <tr>
            <th
              className="sticky left-0 p-2.5 text-left text-[0.72rem] font-semibold uppercase tracking-wide"
              style={{ background: "var(--qr-green-table)", color: "#f5f0e6" }}
            >
              Area
            </th>
            {DAY_LABELS.map((label) => (
              <th
                key={label}
                className="p-2.5 text-right text-[0.72rem] font-semibold uppercase tracking-wide"
                style={{ background: "var(--qr-green-table)", color: "#f5f0e6" }}
              >
                {label.slice(0, 3)}
              </th>
            ))}
            <th
              className="border-l p-2.5 text-right text-[0.72rem] font-semibold uppercase tracking-wide"
              style={{ background: "var(--qr-green-table)", color: "var(--qr-gold-soft)", borderColor: "var(--qr-line)" }}
            >
              Week
            </th>
          </tr>
        </thead>
        <tbody>
          {areas.map((area, i) => {
            const hasLastWeek = (lastWeek[area.id] ?? []).some((v) => v !== null);
            const weekTotal = weekTotalFor(area);
            const forecastOpen = openForecastAreaId === area.id;
            const preview = forecastOpen ? forecastPreview(area) : null;
            const prevArea = areas[i - 1];
            const startsGroupSection = area.kind === "group" && prevArea?.kind !== "group";

            return (
              <Fragment key={area.id}>
                {startsGroupSection && (
                  <tr>
                    <td
                      colSpan={9}
                      className="p-1.5 pl-2 text-[0.68rem] font-semibold uppercase tracking-wide"
                      style={{ background: "var(--qr-total-row)", color: "var(--qr-ink-soft)" }}
                    >
                      Group targets
                    </td>
                  </tr>
                )}
                <tr
                  className="border-b"
                  style={{
                    borderColor: "var(--qr-line)",
                    background: area.kind === "group" ? "var(--qr-card-bg)" : i % 2 === 1 ? "var(--qr-row-alt)" : undefined,
                  }}
                >
                  <td
                    className="sticky left-0 p-2 align-top"
                    style={{ background: area.kind === "group" ? "var(--qr-card-bg)" : i % 2 === 1 ? "var(--qr-row-alt)" : "var(--qr-surface)" }}
                  >
                    <div style={{ color: "var(--qr-ink)", fontWeight: area.kind === "group" ? 600 : undefined }}>
                      {area.label}
                      {area.unit === "percent" ? " (%)" : null}
                    </div>
                    <div className="mt-1 flex gap-2 text-[11px]" style={{ color: "var(--qr-ink-faint)" }}>
                      <button type="button" onClick={() => handleFillWeek(area)} className={actionBtn} title="Fill every day with Monday's value">
                        Fill week
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyLastWeek(area)}
                        disabled={!hasLastWeek}
                        className={actionBtn}
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
                        className={actionBtn}
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
                          className="w-20 rounded border border-transparent bg-transparent px-2 py-1 text-right focus:border-[var(--qr-gold)] focus:outline-none"
                          style={{ color: "var(--qr-ink)" }}
                        />
                      </td>
                    );
                  })}
                  <td className="border-l p-1 text-right" style={{ borderColor: "var(--qr-line)" }}>
                    <input
                      key={weekTotal ?? "empty"}
                      defaultValue={weekTotal === null ? "" : round2(weekTotal)}
                      onBlur={(e) => handleWeekTotalCommit(area, e.target.value)}
                      placeholder="—"
                      inputMode="decimal"
                      title={
                        area.isAveraged
                          ? "Average target for the week — sets every day to this value"
                          : "Weekly total — spread across days by historical day-of-week mix"
                      }
                      className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right font-semibold focus:border-[var(--qr-gold)] focus:outline-none"
                      style={{ color: "var(--qr-ink)" }}
                    />
                  </td>
                </tr>
                {forecastOpen && (
                  <tr key={`${area.id}-forecast`} className="border-b" style={{ borderColor: "var(--qr-line)", background: "var(--qr-gold-soft)" }}>
                    <td colSpan={9} className="p-3">
                      <div className="flex flex-wrap items-end gap-3 text-xs">
                        <label className="flex flex-col gap-1" style={{ color: "var(--qr-ink-soft)" }}>
                          Month
                          <input
                            type="month"
                            value={forecastMonth}
                            onChange={(e) => setForecastMonth(e.target.value)}
                            className="rounded border px-2 py-1"
                            style={{ borderColor: "var(--qr-line)", background: "var(--qr-surface)", color: "var(--qr-ink)" }}
                          />
                        </label>
                        <label className="flex flex-col gap-1" style={{ color: "var(--qr-ink-soft)" }}>
                          {area.isAveraged ? "Monthly target (avg %)" : "Monthly forecast ($)"}
                          <input
                            inputMode="decimal"
                            autoFocus
                            value={forecastAmount}
                            onChange={(e) => setForecastAmount(e.target.value)}
                            className="w-32 rounded border px-2 py-1"
                            style={{ borderColor: "var(--qr-line)", background: "var(--qr-surface)", color: "var(--qr-ink)" }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => applyForecast(area)}
                          disabled={!preview}
                          className="rounded px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ background: "var(--qr-gold)", color: "var(--qr-header-bg)" }}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenForecastAreaId(null)}
                          className="px-2 py-1.5 hover:opacity-80"
                          style={{ color: "var(--qr-ink-soft)" }}
                        >
                          Cancel
                        </button>
                        {preview && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ color: "var(--qr-ink-soft)" }}>
                            {DAY_LABELS.map((label, i) => (
                              <span key={label}>
                                {label.slice(0, 3)} {formatArea(preview[i], area.unit)}
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
      {isPending && (
        <p className="px-2 py-2 text-xs" style={{ color: "var(--qr-ink-soft)" }}>
          Saving…
        </p>
      )}
    </div>
  );
}
