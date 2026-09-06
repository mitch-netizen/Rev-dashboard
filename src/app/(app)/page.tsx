import { createClient } from "@/lib/supabase/server";
import { VENUE_ID, venueNow, mondayOf, addDays, toIsoDate } from "@/lib/revenue/constants";
import WeekGrid, { type WeekGridDay, type WeekGridLine } from "./week-grid";

export default async function CurrentWeekPage() {
  const supabase = await createClient();

  const monday = mondayOf(venueNow());
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

  const totalCells = lines.length * days.length;
  const filledCells = Object.keys(actuals).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Current Week</h1>
        <p className="text-sm text-neutral-500">
          {days[0].label} – {days[6].label} · {filledCells} of {totalCells} figures entered
        </p>
      </div>
      <WeekGrid days={days} lines={lines} actuals={actuals} />
    </div>
  );
}
