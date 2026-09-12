import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "./constants";

export interface WeekGridDay {
  date: string;
  label: string;
}

export interface WeekGridLine {
  id: string;
  label: string;
  unit: "currency" | "percent";
}

export interface WeekGridData {
  monday: Date;
  mondayIso: string;
  isCurrentWeek: boolean;
  days: WeekGridDay[];
  lines: WeekGridLine[];
  actuals: Record<string, number>;
}

// Shared by the current-week page and its Excel export.
export async function fetchWeekGridData(supabase: SupabaseClient, weekParam?: string): Promise<WeekGridData> {
  const today = venueNow();
  const requestedMonday =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? new Date(`${weekParam}T00:00:00Z`) : today;
  const monday = mondayOf(requestedMonday);
  const thisWeekMonday = mondayOf(today);
  const isCurrentWeek = toIsoDate(monday) === toIsoDate(thisWeekMonday);
  const mondayIso = toIsoDate(monday);

  const days: WeekGridDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return {
      date: toIsoDate(d),
      // d is a UTC-midnight Date standing in for a plain calendar date, so
      // format it in UTC too — otherwise the server's own timezone could
      // shift the displayed day by one.
      label: d.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    };
  });

  const { data: lineRows } = await supabase
    .from("rev_revenue_lines")
    .select("id, label, unit")
    .eq("venue_id", VENUE_ID)
    .eq("active", true)
    .order("display_order");

  const lines: WeekGridLine[] = (lineRows ?? []).map((l) => ({
    id: l.id,
    label: l.label,
    unit: l.unit as "currency" | "percent",
  }));

  const { data: actualRows } = await supabase
    .from("rev_daily_actuals")
    .select("trade_date, revenue_line_id, value")
    .eq("venue_id", VENUE_ID)
    .gte("trade_date", days[0].date)
    .lte("trade_date", days[6].date);

  const actuals: Record<string, number> = {};
  for (const row of actualRows ?? []) {
    actuals[`${row.trade_date}|${row.revenue_line_id}`] = Number(row.value);
  }

  return { monday, mondayIso, isCurrentWeek, days, lines, actuals };
}
