// RMS "Occupancy By No Group" parser. Occ % is always the source of truth
// for Accommodation — never derived from room counts. The report can cover
// a forward-looking week or a just-closed one, so each row is matched to
// the database by its own literal date, never assumed to be "this week".
//
// Column order, after the date, as this app's own PDF text extraction
// (pdf-text.ts — Y/X-position clustering, not a raw text-run dump) lays
// it out, matching the report's real left-to-right visual columns:
//   Room, Avail, Maint, Used, Unused, RevPAR, Occ %, Discount, Taxes,
//   Gross Revenue, Nett Revenue, Gross Avg (RevPOR), Nett Avg (RevPOR),
//   Avg LOS, Conf %, Occupants
// Verified against four real report exports (28 days total) via the
// project's actual extractPdfText, not a standalone text dump — a naive
// dump of the PDF's own text-run order comes out with these columns
// reversed and glued together with no whitespace, which is a trap: it
// reads plausibly but does not match what this app actually feeds the
// parser at runtime.
//
// Nett Revenue is Accommodation Revenue (ex-GST, matching every other
// revenue line); Nett Avg (RevPOR) — Nett Revenue / Room Nights Sold — is
// exactly ADR.

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

    const numbers = match[2].trim().split(/\s+/);
    if (numbers.length < 13) continue;
    const occPercent = parseAuNumber(numbers[6]);
    const revenue = parseAuNumber(numbers[10]);
    const nettAvgRevpor = parseAuNumber(numbers[12]);
    if ([occPercent, revenue, nettAvgRevpor].some((n) => Number.isNaN(n))) continue;

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
