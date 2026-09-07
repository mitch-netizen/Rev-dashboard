import { createClient } from "@/lib/supabase/server";
import { fetchAreas } from "@/lib/revenue/targets";
import TargetsGrid from "./targets-grid";

export default async function TargetsPage() {
  const supabase = await createClient();
  const areas = await fetchAreas(supabase);

  const { data: standing } = await supabase
    .from("rev_standing_targets")
    .select("revenue_line_id, group_id, day_of_week, amount")
    .is("effective_to", null);

  const targets: Record<string, number> = {};
  for (const row of standing ?? []) {
    const areaId = row.revenue_line_id ?? row.group_id;
    targets[`${areaId}|${row.day_of_week}`] = Number(row.amount);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Targets</h1>
        <p className="text-sm text-neutral-500">
          Standing day-of-week targets for every revenue line and group. Editing here sets the
          going-forward plan — a week already opened keeps whatever it was seeded with, so past
          weeks never silently change.
        </p>
      </div>
      <TargetsGrid areas={areas} targets={targets} />
    </div>
  );
}
