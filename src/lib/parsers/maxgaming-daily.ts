// Maxgaming "Daily Report" PDF (the venue's own export/print of the portal
// page at ld.maxgaming.com.au, not a screenshot — it carries a real text
// layer). Covers exactly one trade day. This is now the sole gaming source
// (Net Meter is retired) — venue-wide Turnover/Revenue plus Card Usage %
// for the gaming floor and for POS tills, plus New Members.
//
// "Turnover" and "Revenue" each appear twice — once venue-wide near the top
// of the report, once again under "Carded Gaming"/"POS" for the carded-only
// subset — so those two are read from the lines before the "Carded Gaming"
// section header. "Card Usage", "Carded Spend" and "New Members" each
// appear only once, so no section-tracking is needed for those.

export interface MaxgamingDailyResult {
  date: string; // ISO yyyy-mm-dd
  turnover: number;
  revenue: number;
  cardUsageGamingPercent: number;
  cardUsagePosPercent: number;
  newMembers: number;
}

// "Wed 23 09 2026" -> "2026-09-23"
function parseNumericAuDate(raw: string): string | null {
  const match = raw.trim().match(/^[A-Za-z]{3}\s+(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "Turnover 177,263 196,238 10.7%" -> 6wk avg / today / diff — today (the
// second number) is what we want.
function findTodayValue(lines: string[], label: string): number | null {
  const line = lines.find((l) => new RegExp(`^${label}\\s`).test(l));
  const match = line?.match(new RegExp(`^${label}\\s+[\\d,]+\\s+([\\d,]+)`));
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

export function parseMaxgamingDaily(text: string): MaxgamingDailyResult {
  const lines = text.split("\n").map((l) => l.trim());

  let date: string | null = null;
  for (const line of lines) {
    const iso = parseNumericAuDate(line);
    if (iso) {
      date = iso;
      break;
    }
  }
  if (!date) throw new Error("Could not find the report date in Maxgaming Daily Report");

  const cardedGamingIndex = lines.findIndex((l) => l === "Carded Gaming");
  const topLevelLines = cardedGamingIndex === -1 ? lines : lines.slice(0, cardedGamingIndex);

  const turnover = findTodayValue(topLevelLines, "Turnover");
  if (turnover === null) throw new Error("Could not find Turnover in Maxgaming Daily Report");

  const revenue = findTodayValue(topLevelLines, "Revenue");
  if (revenue === null) throw new Error("Could not find Revenue in Maxgaming Daily Report");

  // "Card Usage 42.3% 32.9% -9.4%" -> 6wk avg / today / diff — today is the
  // middle value.
  const cardUsageLine = lines.find((l) => /^Card Usage\s/.test(l));
  const cardUsageMatch = cardUsageLine?.match(/^Card Usage\s+[\d.]+%\s+([\d.]+)%/);
  if (!cardUsageMatch) throw new Error("Could not find Card Usage in Maxgaming Daily Report");
  const cardUsageGamingPercent = Number(cardUsageMatch[1]);

  // "Carded Spend 25.3% 21.5% -3.9%" — same layout, under POS.
  const cardedSpendLine = lines.find((l) => /^Carded Spend\s/.test(l));
  const cardedSpendMatch = cardedSpendLine?.match(/^Carded Spend\s+[\d.]+%\s+([\d.]+)%/);
  if (!cardedSpendMatch) throw new Error("Could not find Carded Spend in Maxgaming Daily Report");
  const cardUsagePosPercent = Number(cardedSpendMatch[1]);

  // "New Members 15" — just today's count, no 6wk avg/diff on this row.
  const newMembersLine = lines.find((l) => /^New Members\s/.test(l));
  const newMembersMatch = newMembersLine?.match(/^New Members\s+(\d+)$/);
  if (!newMembersMatch) throw new Error("Could not find New Members in Maxgaming Daily Report");
  const newMembers = Number(newMembersMatch[1]);

  if (
    Number.isNaN(turnover) ||
    Number.isNaN(revenue) ||
    Number.isNaN(cardUsageGamingPercent) ||
    Number.isNaN(cardUsagePosPercent) ||
    Number.isNaN(newMembers)
  ) {
    throw new Error("Maxgaming Daily Report had non-numeric values where numbers were expected");
  }

  return { date, turnover, revenue, cardUsageGamingPercent, cardUsagePosPercent, newMembers };
}
