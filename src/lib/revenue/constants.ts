export const VENUE_ID = process.env.NEXT_PUBLIC_VENUE_ID!;

// Business week is Monday-Sunday throughout; day_of_week in the database is
// 0 = Monday ... 6 = Sunday, matching that convention (not JS's Sunday-first).
export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

// JS Date#getDay() is 0 = Sunday ... 6 = Saturday; convert to our Monday-first index.
export function jsDayToDayOfWeek(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diff = jsDayToDayOfWeek(d.getUTCDay());
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
