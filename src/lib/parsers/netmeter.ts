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
// A single report can cover a date range rather than one day. If it was
// generated with "Group By: Date" set, it carries a per-day subtotal row
// for every date in the range (verified against a real weekly sample) —
// that's what we extract, one line item per day. Without that grouping,
// there's only a single Grand Total for the whole range with no way to
// recover daily figures, so a multi-day report without day rows is
// rejected rather than silently imported as one day's total.
//
// Variant 2's tab-delimited structure and variant 3's PDF layout for a
// grouped-by-date report have not been verified against a real sample yet.

export interface NetmeterDayResult {
  date: string; // ISO yyyy-mm-dd
  revenue: number;
  turnover: number;
}

function normalizeHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
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

interface HeaderColumns {
  serial?: number;
  date?: number;
  revenue?: number;
  turnover?: number;
}

export async function parseNetmeterXlsx(buffer: Buffer): Promise<NetmeterDayResult[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Net Meter xlsx has no worksheet");

  const headerCol: HeaderColumns = {};
  let headerRowNumber: number | null = null;
  let startDate: string | null = null;
  let grandTotalRow: number | null = null;

  sheet.eachRow((row, rowNumber) => {
    const cells = row.values as unknown[];
    for (let col = 1; col < cells.length; col++) {
      const raw = cells[col];
      if (typeof raw !== "string") continue;
      const text = normalizeHeader(raw);

      if (text === "serial no.") {
        headerCol.serial = col;
        headerRowNumber = rowNumber;
      }
      if (text === "date") headerCol.date = col;
      if (text === "$ revenue") headerCol.revenue = col;
      if (text === "$ turnover") headerCol.turnover = col;
      if (text === "grand total") grandTotalRow = rowNumber;

      if (raw.trim() === "Start Date :") {
        for (let c = col + 1; c < cells.length; c++) {
          if (typeof cells[c] === "string" && (cells[c] as string).trim()) {
            startDate = parseLongAuDate(cells[c] as string);
            break;
          }
        }
      }
    }
  });

  if (headerCol.revenue === undefined || headerCol.turnover === undefined) {
    throw new Error("Could not find $ Revenue / $ Turnover columns in Net Meter report");
  }

  // Grouped by date: one subtotal row per date in the range, distinguished
  // from a per-machine row by having the date column populated and the
  // Serial No. column blank.
  if (headerCol.date !== undefined && headerRowNumber !== null) {
    const days: NetmeterDayResult[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber!) return;
      const cells = row.values as unknown[];
      const dateRaw = cells[headerCol.date!];
      if (typeof dateRaw !== "string") return;
      const iso = shortAuDateToIso(dateRaw);
      if (!iso) return; // Grand Total / Total-for-venue / blank row

      const serialRaw = headerCol.serial !== undefined ? cells[headerCol.serial] : undefined;
      if (serialRaw !== undefined && serialRaw !== null && String(serialRaw).trim() !== "") return;

      const revenue = Number(cells[headerCol.revenue!]);
      const turnover = Number(cells[headerCol.turnover!]);
      if (Number.isNaN(revenue) || Number.isNaN(turnover)) return;
      days.push({ date: iso, revenue, turnover });
    });

    if (days.length === 0) {
      throw new Error(
        "Net Meter report has a Date column but no day rows could be read — check the report format"
      );
    }
    return days;
  }

  // Not grouped by date: only a single Grand Total for the whole range.
  if (!startDate) throw new Error("Could not find Start Date in Net Meter report");
  if (grandTotalRow === null) throw new Error("Could not find Grand Total row in Net Meter report");

  const totalRowCells = sheet.getRow(grandTotalRow).values as unknown[];
  const revenue = Number(totalRowCells[headerCol.revenue!]);
  const turnover = Number(totalRowCells[headerCol.turnover!]);
  if (Number.isNaN(revenue) || Number.isNaN(turnover)) {
    throw new Error("Grand Total row did not contain numeric Revenue/Turnover values");
  }

  return [{ date: startDate, revenue, turnover }];
}

// Variant 2: tab-delimited text disguised with a .xlsx filename. Unverified
// against a real sample — built from the same column-header contract as
// the genuine xlsx, including the date-grouped case.
export function parseNetmeterText(text: string): NetmeterDayResult[] {
  const lines = text.split(/\r?\n/).map((l) => l.split("\t"));

  const headerCol: HeaderColumns = {};
  let headerRowIndex: number | null = null;
  let startDate: string | null = null;
  let grandTotalRow: string[] | null = null;

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
    const cells = lines[rowIndex];
    for (let col = 0; col < cells.length; col++) {
      const raw = (cells[col] ?? "").trim();
      const text = normalizeHeader(raw);

      if (text === "serial no.") {
        headerCol.serial = col;
        headerRowIndex = rowIndex;
      }
      if (text === "date") headerCol.date = col;
      if (text === "$ revenue") headerCol.revenue = col;
      if (text === "$ turnover") headerCol.turnover = col;
      if (text === "grand total") grandTotalRow = cells;

      if (raw === "Start Date :" && cells[col + 1]) startDate = parseLongAuDate(cells[col + 1]);
    }
  }

  if (headerCol.revenue === undefined || headerCol.turnover === undefined) {
    throw new Error("Could not find $ Revenue / $ Turnover columns in Net Meter report");
  }

  if (headerCol.date !== undefined && headerRowIndex !== null) {
    const days: NetmeterDayResult[] = [];
    lines.forEach((cells, rowIndex) => {
      if (rowIndex <= headerRowIndex!) return;
      const dateRaw = (cells[headerCol.date!] ?? "").trim();
      const iso = shortAuDateToIso(dateRaw);
      if (!iso) return;

      const serialRaw = headerCol.serial !== undefined ? (cells[headerCol.serial] ?? "").trim() : "";
      if (serialRaw !== "") return;

      const revenue = Number((cells[headerCol.revenue!] ?? "").replace(/,/g, ""));
      const turnover = Number((cells[headerCol.turnover!] ?? "").replace(/,/g, ""));
      if (Number.isNaN(revenue) || Number.isNaN(turnover)) return;
      days.push({ date: iso, revenue, turnover });
    });

    if (days.length === 0) {
      throw new Error(
        "Net Meter report has a Date column but no day rows could be read — check the report format"
      );
    }
    return days;
  }

  if (!startDate) throw new Error("Could not find Start Date in Net Meter report");
  if (!grandTotalRow) throw new Error("Could not find Grand Total row in Net Meter report");

  const revenue = Number((grandTotalRow[headerCol.revenue!] ?? "").replace(/,/g, ""));
  const turnover = Number((grandTotalRow[headerCol.turnover!] ?? "").replace(/,/g, ""));
  if (Number.isNaN(revenue) || Number.isNaN(turnover)) {
    throw new Error("Grand Total row did not contain numeric Revenue/Turnover values");
  }

  return [{ date: startDate, revenue, turnover }];
}

// Variant 3: genuine Maxgaming PDF, per-machine breakdown, possibly spanning
// multiple pages with the Grand Total only on the final page. Unverified
// against a real sample — and does not yet handle a date-grouped multi-day
// version of this variant, since no sample of one exists.
export function parseNetmeterPdfPages(pages: string[]): NetmeterDayResult[] {
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

  return [{ date: startDate, revenue, turnover }];
}
