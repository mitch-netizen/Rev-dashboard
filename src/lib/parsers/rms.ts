// RMS "Occupancy By No Group" parser. Occ % is always the source of truth
// for Accommodation — never derived from room counts. The report can cover
// a forward-looking week or a just-closed one, so each row is matched to
// the database by its own literal date, never assumed to be "this week".

export interface RmsDayResult {
  date: string; // ISO yyyy-mm-dd
  occPercent: number;
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
    // Room, Avail, Maint, Used, Unused, RevPAR, Occ % ...
    const occRaw = numbers[6];
    if (occRaw === undefined) continue;
    const occPercent = Number(occRaw);
    if (Number.isNaN(occPercent)) continue;

    // "<date> Total:" rows repeat the same date+figures under the weekday
    // section header — first occurrence (the plain date row) wins, dedupe
    // rather than double-processing.
    if (seen.has(iso)) continue;
    seen.add(iso);

    days.push({ date: iso, occPercent });
  }

  if (days.length === 0) {
    throw new Error("No date rows found in RMS Occupancy report");
  }

  return days;
}
