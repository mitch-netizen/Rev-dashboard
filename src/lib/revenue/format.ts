export type RevenueUnit = "currency" | "percent" | "count";

export function formatCurrency(value: number, fractionDigits = 0): string {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatArea(value: number, unit: RevenueUnit, fractionDigits?: number): string {
  if (unit === "percent") return `${value.toFixed(fractionDigits ?? 1)}%`;
  if (unit === "count") return value.toLocaleString("en-AU", { maximumFractionDigits: 0 });
  return formatCurrency(value, fractionDigits ?? 0);
}

// Shortens the handful of revenue-line labels long enough to crowd out a
// dense per-line table column (e.g. the Review page's Daily Actuals grid,
// one column per line) — left as full names everywhere else in the app.
export function abbreviateLineLabel(label: string): string {
  return label.replace(/\bMain Bar\b/g, "MB").replace(/\bSports Bar\b/g, "SB").replace(/\bAccommodation\b/g, "Accomm");
}

export function formatSigned(value: number, unit: RevenueUnit): string {
  const sign = value >= 0 ? "+" : "";
  if (unit === "percent") return `${sign}${value.toFixed(1)}pp`;
  if (unit === "count") return `${sign}${value.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
  return `${sign}${formatCurrency(value, 0)}`;
}
