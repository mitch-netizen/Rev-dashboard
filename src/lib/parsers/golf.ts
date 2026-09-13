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

export function parseGolfLedger(text: string): GolfDayResult[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("Golf ledger CSV is empty");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const creditCol = header.indexOf("credit");
  const debitCol = header.indexOf("debit");
  const accountCol = header.indexOf("account");
  const classCol = header.indexOf("class");
  const dateCol = header.indexOf("date");

  if ([creditCol, debitCol, accountCol, classCol, dateCol].includes(-1)) {
    throw new Error(
      "Golf ledger CSV is missing an expected column (credit, debit, account, class, date)"
    );
  }

  const totalsByDate = new Map<string, number>();

  for (const row of rows.slice(1)) {
    if (row.length < header.length) continue;
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
    throw new Error("No revenue (account 4000) rows found in Golf ledger CSV");
  }

  return [...totalsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
}
