import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAreas, fetchTargetHelpers } from "@/lib/revenue/targets";
import StandingTargetsGrid from "./standing-targets-grid";

export default async function StandingTargetsPage() {
  const supabase = await createClient();
  const areas = await fetchAreas(supabase);

  const [{ data: standing }, { weights, lastWeek }] = await Promise.all([
    supabase
      .from("rev_standing_targets")
      .select("revenue_line_id, group_id, day_of_week, amount")
      .is("effective_to", null),
    fetchTargetHelpers(supabase, areas),
  ]);

  const targets: Record<string, number> = {};
  for (const row of standing ?? []) {
    const areaId = row.revenue_line_id ?? row.group_id;
    targets[`${areaId}|${row.day_of_week}`] = Number(row.amount);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4 sm:p-5" style={{ background: "var(--qr-header-bg)", borderColor: "var(--qr-line)" }}>
        <Link
          href="/targets"
          className="text-xs hover:opacity-80"
          style={{ color: "var(--qr-gold)" }}
        >
          ← Back to Targets
        </Link>
        <h1 className="font-display mt-1 text-lg font-bold" style={{ color: "var(--qr-header-fg)" }}>
          Standing Pattern
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--qr-gold)" }}>
          The going-forward template for every revenue line and group
        </p>
        <p className="mt-2 max-w-3xl text-xs" style={{ color: "var(--qr-header-fg)", opacity: 0.75 }}>
          Editing here sets the plan for weeks not yet opened — a week already opened keeps
          whatever it was seeded with here, so past and current weeks never silently change. To
          fix a week that&apos;s already open, edit it directly on the Targets tab instead. Type
          into a day directly, or use Week / Forecast to fill the row from a total.
        </p>
      </div>
      <StandingTargetsGrid areas={areas} targets={targets} weights={weights} lastWeek={lastWeek} />
    </div>
  );
}
