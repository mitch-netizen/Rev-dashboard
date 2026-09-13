// Golf (bay bookings) ledger export from the venue's golf-simulator booking
// platform. This is a full double-entry ledger, not a report built for this
// purpose — every purchase, payment, payout and processing fee is one row.
// Venue revenue is only the credits to account 4000 (class "revenue"):
// booking lines ("bay>public rate", "bay>functions") and rental-club product
// lines. A voided/refunded booking shows as a debit to the same account,
// which nets against its original credit automatically — no special-casing
// needed. Everything else (AR movement, Adyen payment/payout plumbing,
// YGB's own reservation-fee liability, card processing fees) is not venue
// revenue and is ignored.

export interface GolfDayResult {
  date: string; // ISO yyyy-mm-dd
  revenue: number;
}

// A small RFC4180 CSV reader — quoted fields, doubled-quote escaping, and
// commas embedded inside quotes (the "meta" column here is a JSON blob).
function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const REQUIRED_COLUMNS = ["credit", "debit", "account", "class", "date"] as const;

// Looks up the 5 columns this parser actually needs by name (not position —
// the source has several other columns, e.g. sourceType/meta, that vary
// between exports) and returns null if the header doesn't look like a golf
// ledger at all, so a caller can use that to distinguish it from another
// report rather than only via a thrown error.
function findRequiredColumns(header: string[]): Record<(typeof REQUIRED_COLUMNS)[number], number> | null {
  const cols = {} as Record<(typeof REQUIRED_COLUMNS)[number], number>;
  for (const name of REQUIRED_COLUMNS) {
    const idx = header.indexOf(name);
    if (idx === -1) return null;
    cols[name] = idx;
  }
  return cols;
}

// Shared by both the CSV export and the genuine-.xlsx export — same column
// contract, just a different way of getting to a 2D array of cell text.
function parseGolfRows(rows: string[][]): GolfDayResult[] {
  if (rows.length === 0) throw new Error("Golf ledger is empty");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const cols = findRequiredColumns(header);
  if (!cols) {
    throw new Error("Golf ledger is missing an expected column (credit, debit, account, class, date)");
  }
  const { credit: creditCol, debit: debitCol, account: accountCol, class: classCol, date: dateCol } = cols;

  const totalsByDate = new Map<string, number>();

  for (const row of rows.slice(1)) {
    if (row[classCol]?.trim().toLowerCase() !== "revenue") continue;
    if (row[accountCol]?.trim() !== "4000") continue;

    const dateMatch = row[dateCol]?.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const iso = dateMatch[1];

    const credit = Number(row[creditCol]?.trim() || "0");
    const debit = Number(row[debitCol]?.trim() || "0");
    if (Number.isNaN(credit) || Number.isNaN(debit)) continue;

    totalsByDate.set(iso, (totalsByDate.get(iso) ?? 0) + credit - debit);
  }

  if (totalsByDate.size === 0) {
    throw new Error("No revenue (account 4000) rows found in Golf ledger");
  }

  return [...totalsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
}

export function parseGolfLedger(text: string): GolfDayResult[] {
  return parseGolfRows(parseCsv(text));
}

// ExcelJS cell values arrive as strings, numbers, Dates, or occasionally a
// rich-text/formula wrapper object — normalise all of those down to the same
// plain text parseGolfRows expects from a CSV field. A date cell in this
// source has no real timezone (an Excel date is just a serial number; the
// booking platform's CSV export writes the same underlying timestamp as a
// bare "yyyy-mm-dd hh:mm" with no zone marker either), so reading it back
// via UTC fields — rather than the host's local timezone — reproduces the
// exact same calendar day as the CSV export of the same data.
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellToText(v.result);
    return "";
  }
  return String(value);
}

// The golf booking platform also lets this same ledger be exported as a
// genuine .xlsx (as opposed to the CSV/disguised-text form parseGolfLedger
// handles). Returns null — rather than throwing — when the workbook's
// header doesn't look like this ledger at all, so detectAndParse can fall
// back to Net Meter, the only other known genuine-.xlsx report.
export async function tryParseGolfXlsx(buffer: Buffer): Promise<GolfDayResult[] | null> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return null;

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells = (row.values as unknown[]).slice(1);
    rows.push(cells.map(cellToText));
  });
  if (rows.length === 0) return null;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!findRequiredColumns(header)) return null;

  return parseGolfRows(rows);
}
