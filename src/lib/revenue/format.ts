export type RevenueUnit = "currency" | "percent" | "count";

export function formatCurrency(value: number, fractionDigits = 0): string {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatArea(value: number, unit: RevenueUnit, fractionDigits = 0): string {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "count") return value.toLocaleString("en-AU", { maximumFractionDigits: 0 });
  return formatCurrency(value, fractionDigits);
}

export function formatSigned(value: number, unit: RevenueUnit): string {
  const sign = value >= 0 ? "+" : "";
  if (unit === "percent") return `${sign}${value.toFixed(1)}pp`;
  if (unit === "count") return `${sign}${value.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
  return `${sign}${formatCurrency(value, 0)}`;
}
