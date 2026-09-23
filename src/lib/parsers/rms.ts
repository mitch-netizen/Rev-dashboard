// RMS "Occupancy By No Group" parser. Occ % is always the source of truth
// for Accommodation — never derived from room counts. The report can cover
// a forward-looking week or a just-closed one, so each row is matched to
// the database by its own literal date, never assumed to be "this week".
//
// Real exports glue every numeric column onto the date with no separating
// whitespace at all (PDF text extraction preserves reading order but not
// the visual column gaps), so columns can't be split on whitespace. What's
// reliable instead: the row always ends with the same 8 decimal-formatted
// fields, in this fixed order —
//   Nett Avg (RevPOR), Gross Avg (RevPOR), Nett Revenue, Gross Revenue,
//   Taxes, Discount, Occ %, RevPAR
// — regardless of how many optional lead-in fields (Occupants, Conf %, Avg
// LOS) happen to render before them. Counting from the end of the decimal
// tokens is therefore stable even though the front of the row isn't.
// Nett Avg (RevPOR) — Nett Revenue / Room Nights Sold — is exactly the
// venue's ADR; Nett Revenue is Accommodation Revenue. Both are ex-GST,
// matching every other revenue line (e.g. SwiftPOS's "Sales Exc GST").
// Verified against real report exports: for every row, Nett Revenue /
// Nett Avg (RevPOR) recovers the integer room-nights-sold figure, and
// Gross figures are exactly 1.1x their Nett counterpart (10% GST).

export interface RmsDayResult {
  date: string; // ISO yyyy-mm-dd
  occPercent: number;
  revenue: number;
  adr: number | null; // null on a day with zero occupancy (Nett Avg is meaningless)
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const DECIMAL_RE = /-?\d{1,3}(?:,\d{3})*\.\d{2}/g;

// "31 Aug 2026" -> "2026-08-31"
function shortAuDateToIso(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})$/);
  if (!match) return null;
  const [, d, mAbbr, y] = match;
  const m = MONTHS.indexOf(mAbbr.toLowerCase()) + 1;
  if (m === 0) return null;
  return `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseAuNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

export function parseRms(text: string): RmsDayResult[] {
  const dateRowRe = /^(\d{1,2}\s+[A-Za-z]{3}\w*\s+\d{4})\s+(.+)$/;
  const days: RmsDayResult[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const match = line.match(dateRowRe);
    if (!match) continue;

    const iso = shortAuDateToIso(match[1]);
    if (!iso) continue;

    const decimals = [...match[2].matchAll(DECIMAL_RE)].map((m) => m[0]);
    if (decimals.length < 8) continue;
    const [nettAvgRevporRaw, , nettRevenueRaw, , , , occPercentRaw] = decimals.slice(-8);

    const nettAvgRevpor = parseAuNumber(nettAvgRevporRaw);
    const revenue = parseAuNumber(nettRevenueRaw);
    const occPercent = parseAuNumber(occPercentRaw);
    if ([nettAvgRevpor, revenue, occPercent].some((n) => Number.isNaN(n))) continue;

    // "<date> Total:" rows repeat the same date+figures under the weekday
    // section header — first occurrence (the plain date row) wins, dedupe
    // rather than double-processing.
    if (seen.has(iso)) continue;
    seen.add(iso);

    days.push({ date: iso, occPercent, revenue, adr: occPercent > 0 ? nettAvgRevpor : null });
  }

  if (days.length === 0) {
    throw new Error("No date rows found in RMS Occupancy report");
  }

  return days;
}
