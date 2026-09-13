// Pure math for turning a single weekly or monthly revenue number into a
// day-of-week target pattern. No Supabase/React here — data fetching lives
// in targets.ts, this just does the arithmetic so it's easy to reason about
// in isolation.

import { jsDayToDayOfWeek } from "./constants";

// A "typical single day" figure for each weekday (Monday..Sunday, index
// 0..6) — historical average $ (or, for an averaged line, average %) on
// that weekday. Not normalised to any particular scale: distributeWeeklyTotal
// and distributeMonthlyForecast both just need the day-to-day *ratios*, and
// dividing every weekday by the same total elapsed days would leave those
// ratios unchanged, so raw averages work as well as normalised weights.
export type DayOfWeekWeights = number[];

export const EQUAL_WEIGHTS: DayOfWeekWeights = [1, 1, 1, 1, 1, 1, 1];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeDayOfWeekWeights(rows: { date: string; value: number }[]): DayOfWeekWeights {
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    const dow = jsDayToDayOfWeek(new Date(`${row.date}T00:00:00Z`).getUTCDay());
    sums[dow] += row.value;
    counts[dow] += 1;
  }

  const withData = counts.filter((c) => c > 0).length;
  if (withData === 0) return [...EQUAL_WEIGHTS];

  // A weekday with no history yet (new line, short trading history) falls
  // back to the average of whatever weekdays do have data, rather than 0 —
  // 0 would zero that day out of every distribution instead of just making
  // it an unweighted guess.
  const fallback = sums.reduce((a, b) => a + b, 0) / rows.length;
  return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : fallback));
}

// Spreads a single weekly figure across the 7 weekdays proportionally to
// `weights`. A week has exactly one occurrence of each weekday, so the
// result always sums back to `total`.
export function distributeWeeklyTotal(total: number, weights: DayOfWeekWeights): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => round2(total / 7));
  return weights.map((w) => round2((total * w) / weightSum));
}

// Mon=0..Sun=6 occurrence count for a given calendar month.
export function countWeekdaysInMonth(year: number, month1to12: number): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = jsDayToDayOfWeek(new Date(Date.UTC(year, month1to12 - 1, day)).getUTCDay());
    counts[dow] += 1;
  }
  return counts;
}

// Spreads a single monthly figure across the 7 weekdays, weighted by both
// day-of-week seasonality and how many of each weekday actually fall in
// that month (a 5-Friday month vs. a 4-Friday one) — so
// Σ amount[d] * weekdayCounts[d] over the week always equals `total`.
export function distributeMonthlyForecast(
  total: number,
  weights: DayOfWeekWeights,
  weekdayCounts: number[]
): number[] {
  const denom = weights.reduce((sum, w, i) => sum + w * weekdayCounts[i], 0);
  if (denom <= 0) {
    const totalDays = weekdayCounts.reduce((a, b) => a + b, 0) || 1;
    return weekdayCounts.map(() => round2(total / totalDays));
  }
  return weights.map((w) => round2((total * w) / denom));
}
