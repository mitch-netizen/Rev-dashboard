import Link from "next/link";
import { addDays, toIsoDate } from "@/lib/revenue/constants";
import { formatArea, formatSigned } from "@/lib/revenue/format";
import type { HeadlineRow } from "@/lib/revenue/week-kpis";

export type WeekTab = "entry" | "review" | "recovery" | "targets";

const TABS: { key: WeekTab; label: string; href: string; hint: string }[] = [
  { key: "entry", label: "Entry", href: "/", hint: "Enter daily actuals" },
  { key: "review", label: "Review", href: "/week-review", hint: "Headline KPIs & trends" },
  { key: "recovery", label: "Recovery", href: "/recovery", hint: "Pacing vs target" },
  { key: "targets", label: "Targets", href: "/targets", hint: "Edit this week's targets" },
];

function weekHref(basePath: string, weekIso: string, isCurrentWeek: boolean): string {
  return isCurrentWeek ? basePath : `${basePath}?week=${weekIso}`;
}

function KpiCard({ row }: { row: HeadlineRow }) {
  const pctToTarget =
    row.actual !== null && row.weeklyTarget !== null && row.weeklyTarget !== 0
      ? Math.round((row.actual / row.weeklyTarget) * 100)
      : null;
  const trendUp = row.trend !== null && row.trend >= 0;
  const trendSuffix = row.area.isAveraged ? "pp" : "%";

  return (
    <div
      className="min-w-[168px] flex-1 rounded-lg border p-3"
      style={{
        background: "var(--qr-card-bg)",
        borderColor: "var(--qr-line)",
        borderLeft: `4px solid ${row.isBehind ? "var(--qr-red)" : "var(--qr-gold)"}`,
      }}
    >
      <div
        className="text-[0.68rem] font-semibold uppercase tracking-wide"
        style={{ color: "var(--qr-ink-soft)" }}
      >
        {row.area.label}
      </div>
      <div className="font-display mt-1 text-xl font-bold" style={{ color: "var(--qr-ink)" }}>
        {row.actual !== null ? formatArea(row.actual, row.area.unit) : "—"}
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--qr-ink-soft)" }}>
        {row.weeklyTarget === null
          ? "No target set"
          : pctToTarget !== null
            ? `${pctToTarget}% to target`
            : "—"}
        {row.variance !== null && (
          <span
            className="ml-1.5 font-medium"
            style={{ color: row.isBehind ? "var(--qr-red-status-fg)" : "var(--qr-green-status-fg)" }}
          >
            {formatSigned(row.variance, row.area.unit)}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs font-medium" style={{ color: "var(--qr-ink-faint)" }}>
        {row.trend === null ? (
          "No prior week data"
        ) : (
          <span style={{ color: trendUp ? "var(--qr-green-status-fg)" : "var(--qr-red-status-fg)" }}>
            {trendUp ? "▲ +" : "▼ −"}
            {Math.abs(row.trend).toFixed(1)}
            {trendSuffix}
            <span style={{ color: "var(--qr-ink-faint)", fontWeight: 400 }}> vs last wk</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function WeekShell({
  active,
  mondayIso,
  isCurrentWeek,
  kpis,
  actions,
  children,
}: {
  active: WeekTab;
  mondayIso: string;
  isCurrentWeek: boolean;
  kpis: HeadlineRow[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const monday = new Date(`${mondayIso}T00:00:00Z`);
  const sunday = addDays(monday, 6);
  const rangeLabel = `${monday.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })} – ${sunday.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  const prevWeekIso = toIsoDate(addDays(monday, -7));
  const nextWeekIso = toIsoDate(addDays(monday, 7));
  const activeTab = TABS.find((t) => t.key === active)!;

  return (
    <div className="space-y-5">
      <div
        className="rounded-lg border p-4 print:hidden sm:p-5"
        style={{ background: "var(--qr-header-bg)", borderColor: "var(--qr-line)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-display text-lg font-bold" style={{ color: "var(--qr-header-fg)" }}>
              {isCurrentWeek ? "Current Week" : "Week"} · {rangeLabel}
            </div>
            <div className="mt-0.5 text-xs" style={{ color: "var(--qr-gold)" }}>
              {activeTab.hint}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={weekHref(activeTab.href, prevWeekIso, false)}
              className="rounded-md border px-3 py-1.5 hover:opacity-80"
              style={{ borderColor: "var(--qr-ink-faint)", color: "var(--qr-header-fg)" }}
            >
              ← Prev
            </Link>
            {!isCurrentWeek && (
              <Link
                href={activeTab.href}
                className="rounded-md border px-3 py-1.5 hover:opacity-80"
                style={{ borderColor: "var(--qr-gold)", color: "var(--qr-gold)" }}
              >
                This week
              </Link>
            )}
            <Link
              href={weekHref(activeTab.href, nextWeekIso, false)}
              className="rounded-md border px-3 py-1.5 hover:opacity-80"
              style={{ borderColor: "var(--qr-ink-faint)", color: "var(--qr-header-fg)" }}
            >
              Next →
            </Link>
            {actions}
          </div>
        </div>

        <nav className="mt-4 flex gap-1 border-b" style={{ borderColor: "var(--qr-ink-faint)" }}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={weekHref(tab.href, mondayIso, isCurrentWeek)}
                className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  borderColor: isActive ? "var(--qr-gold)" : "transparent",
                  color: isActive ? "var(--qr-gold)" : "var(--qr-header-fg)",
                  opacity: isActive ? 1 : 0.75,
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {kpis.length > 0 && (
        <div className="flex flex-wrap gap-3 print:hidden">
          {kpis.map((row) => (
            <KpiCard key={row.area.id} row={row} />
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
