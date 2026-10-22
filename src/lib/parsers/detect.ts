import { sniffFileType } from "./sniff";
import { extractPdfText } from "./pdf-text";
import { parseSwiftpos, type SwiftposParseResult } from "./swiftpos";
import { parseRms, type RmsDayResult } from "./rms";
import { parseGolfLedger, tryParseGolfXlsx, tryParseGolfPurchaseReportXlsx, type GolfDayResult } from "./golf";
import { parseMaxgamingDaily, type MaxgamingDailyResult } from "./maxgaming-daily";

export type DetectedReport =
  | { type: "swiftpos"; result: SwiftposParseResult }
  | { type: "rms"; result: RmsDayResult[] }
  | { type: "golf"; result: GolfDayResult[] }
  | { type: "maxgaming_daily"; result: MaxgamingDailyResult };

// The golf booking platform's ledger export — a quoted CSV. Its genuine-xlsx
// form used to need disambiguating from Net Meter's disguised-xlsx export;
// now that Net Meter is retired, xlsx/tab-text files have only this one
// known source.
const GOLF_LEDGER_HEADER = /^"reference","venue","credit","debit","account","class","memo","date","source"/;

export async function detectAndParse(buffer: Buffer): Promise<DetectedReport> {
  const fileType = sniffFileType(buffer);

  if (fileType === "xlsx") {
    const ledgerResult = await tryParseGolfXlsx(buffer);
    if (ledgerResult) return { type: "golf", result: ledgerResult };
    const purchaseReportResult = await tryParseGolfPurchaseReportXlsx(buffer);
    if (purchaseReportResult) return { type: "golf", result: purchaseReportResult };
    throw new Error("Unrecognised .xlsx report — expected a Golf booking ledger or purchase report export");
  }

  if (fileType === "text") {
    const text = buffer.toString("utf-8");
    if (GOLF_LEDGER_HEADER.test(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)) {
      return { type: "golf", result: parseGolfLedger(text) };
    }
    throw new Error("Unrecognised text report — expected a Golf booking ledger export");
  }

  // PDF: distinguish by report title text.
  const pages = await extractPdfText(buffer);
  const fullText = pages.join("\n");

  if (/Master Group Sales by Location/i.test(fullText)) {
    return { type: "swiftpos", result: parseSwiftpos(fullText) };
  }

  if (/Occupancy By No Group/i.test(fullText)) {
    return { type: "rms", result: parseRms(fullText) };
  }

  // Maxgaming's "Daily Report" export — the venue's sole gaming source now
  // that Net Meter is retired.
  if (/Carded Gaming/i.test(fullText) && /Carded Spend/i.test(fullText)) {
    return { type: "maxgaming_daily", result: parseMaxgamingDaily(fullText) };
  }

  throw new Error("Unrecognised PDF report — could not match it to a known report type");
}
