// Net Meter (Gaming) parser. Three source variants are known:
//  1. A genuine xlsx export ("Net Meter - Simplified") — verified against a
//     real sample.
//  2. The same report occasionally arrives with a .xlsx filename but is
//     actually tab-delimited text — content-sniffed, not extension-trusted.
//  3. A genuine multi-page PDF from Maxgaming's per-machine breakdown, with
//     the Grand Total only on the final page.
//
// Unlike SwiftPOS, this report is dated directly by trade day — no offset.
//
// Variants 2 and 3 are implemented generically from the spec but have not
// been verified against a real sample yet (flagged when the plan was made).
// If either misparses a real file, that's the first place to look.

export interface NetmeterParseResult {
  tradeDate: string; // ISO yyyy-mm-dd, from the report's Start Date
  endDate: string | null; // present so the UI can flag a multi-day report instead of silently using only the start date
  revenue: number;
  turnover: number;
}

function normalizeHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function looksLikeRevenueHeader(s: string): boolean {
  return normalizeHeader(s) === "$ revenue";
}

function looksLikeTurnoverHeader(s: string): boolean {
  return normalizeHeader(s) === "$ turnover";
}

// "29 August 2026" -> "2026-08-29"
function parseLongAuDate(raw: string): string | null {
  const match = raw
    .trim()
    .match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
  if (!match) return null;
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const [, d, mName, y] = match;
  const m = months.indexOf(mName.toLowerCase()) + 1;
  return `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export async function parseNetmeterXlsx(buffer: Buffer): Promise<NetmeterParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Net Meter xlsx has no worksheet");

  let startDate: string | null = null;
  let endDate: string | null = null;
  const headerCol: { revenue?: number; turnover?: number } = {};
  let grandTotalRow: number | null = null;

  sheet.eachRow((row, rowNumber) => {
    const cells = row.values as unknown[]; // 1-indexed, index 0 unused
    for (let col = 1; col < cells.length; col++) {
      const raw = cells[col];
      if (typeof raw !== "string") continue;
      const text = raw.trim();

      if (text === "Start Date :") {
        for (let c = col + 1; c < cells.length; c++) {
          if (typeof cells[c] === "string" && (cells[c] as string).trim()) {
            startDate = parseLongAuDate(cells[c] as string);
            break;
          }
        }
      }
      if (text === "End Date :") {
        for (let c = col + 1; c < cells.length; c++) {
          if (typeof cells[c] === "string" && (cells[c] as string).trim()) {
            endDate = parseLongAuDate(cells[c] as string);
            break;
          }
        }
      }
      if (looksLikeRevenueHeader(text)) headerCol.revenue = col;
      if (looksLikeTurnoverHeader(text)) headerCol.turnover = col;
      if (text.toLowerCase() === "grand total") grandTotalRow = rowNumber;
    }
  });

  if (!startDate) throw new Error("Could not find Start Date in Net Meter report");
  if (headerCol.revenue === undefined || headerCol.turnover === undefined) {
    throw new Error("Could not find $ Revenue / $ Turnover columns in Net Meter report");
  }
  if (grandTotalRow === null) {
    throw new Error("Could not find Grand Total row in Net Meter report");
  }

  const row = sheet.getRow(grandTotalRow).values as unknown[];
  const revenue = Number(row[headerCol.revenue]);
  const turnover = Number(row[headerCol.turnover]);
  if (Number.isNaN(revenue) || Number.isNaN(turnover)) {
    throw new Error("Grand Total row did not contain numeric Revenue/Turnover values");
  }

  return { tradeDate: startDate, endDate, revenue, turnover };
}

// Variant 2: tab-delimited text disguised with a .xlsx filename. Unverified
// against a real sample — built from the same column-header/Grand Total
// contract as the genuine xlsx.
export function parseNetmeterText(text: string): NetmeterParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.split("\t"));

  let startDate: string | null = null;
  let endDate: string | null = null;
  const headerCol: { revenue?: number; turnover?: number } = {};
  let grandTotalRow: string[] | null = null;

  for (const cells of lines) {
    for (let col = 0; col < cells.length; col++) {
      const text = (cells[col] ?? "").trim();
      if (text === "Start Date :" && cells[col + 1]) startDate = parseLongAuDate(cells[col + 1]);
      if (text === "End Date :" && cells[col + 1]) endDate = parseLongAuDate(cells[col + 1]);
      if (looksLikeRevenueHeader(text)) headerCol.revenue = col;
      if (looksLikeTurnoverHeader(text)) headerCol.turnover = col;
      if (text.toLowerCase() === "grand total") grandTotalRow = cells;
    }
  }

  if (!startDate) throw new Error("Could not find Start Date in Net Meter report");
  if (headerCol.revenue === undefined || headerCol.turnover === undefined) {
    throw new Error("Could not find $ Revenue / $ Turnover columns in Net Meter report");
  }
  if (!grandTotalRow) throw new Error("Could not find Grand Total row in Net Meter report");

  const revenue = Number((grandTotalRow[headerCol.revenue] ?? "").replace(/,/g, ""));
  const turnover = Number((grandTotalRow[headerCol.turnover] ?? "").replace(/,/g, ""));
  if (Number.isNaN(revenue) || Number.isNaN(turnover)) {
    throw new Error("Grand Total row did not contain numeric Revenue/Turnover values");
  }

  return { tradeDate: startDate, endDate, revenue, turnover };
}

// Variant 3: genuine Maxgaming PDF, per-machine breakdown, possibly spanning
// multiple pages with the Grand Total only on the final page. Unverified
// against a real sample.
export function parseNetmeterPdfPages(pages: string[]): NetmeterParseResult {
  const fullText = pages.join("\n");

  const dateMatch = fullText.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );
  if (!dateMatch) throw new Error("Could not find a trade date in Net Meter PDF");
  const startDate = parseLongAuDate(dateMatch[0]);
  if (!startDate) throw new Error("Could not parse trade date in Net Meter PDF");

  const grandTotalLine = fullText
    .split("\n")
    .find((l) => /grand total/i.test(l));
  if (!grandTotalLine) throw new Error("Could not find Grand Total line in Net Meter PDF");

  const amounts = [...grandTotalLine.matchAll(/-?[\d,]+\.\d{2}/g)].map((m) =>
    Number(m[0].replace(/,/g, ""))
  );
  if (amounts.length < 2) {
    throw new Error("Grand Total line did not contain Revenue/Turnover values");
  }
  // convention matching the xlsx variant: Revenue precedes Turnover
  const [revenue, turnover] = amounts;

  return { tradeDate: startDate, endDate: null, revenue, turnover };
}
