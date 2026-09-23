import { sniffFileType } from "./sniff";
import { extractPdfText } from "./pdf-text";
import { parseSwiftpos, type SwiftposParseResult } from "./swiftpos";
import { parseRms, type RmsDayResult } from "./rms";
import {
  parseNetmeterXlsx,
  parseNetmeterText,
  parseNetmeterPdfPages,
  type NetmeterDayResult,
} from "./netmeter";
import { parseGolfLedger, tryParseGolfXlsx, type GolfDayResult } from "./golf";
import { parseMaxgamingDaily, type MaxgamingDailyResult } from "./maxgaming-daily";

export type DetectedReport =
  | { type: "swiftpos"; result: SwiftposParseResult }
  | { type: "netmeter"; result: NetmeterDayResult[] }
  | { type: "rms"; result: RmsDayResult[] }
  | { type: "golf"; result: GolfDayResult[] }
  | { type: "maxgaming_daily"; result: MaxgamingDailyResult };

// The golf booking platform's ledger export — a quoted CSV, distinguished
// from Net Meter's disguised-.xlsx tab-delimited text by this header, which
// is unique to this source.
const GOLF_LEDGER_HEADER = /^"reference","venue","credit","debit","account","class","memo","date","source"/;

export async function detectAndParse(buffer: Buffer): Promise<DetectedReport> {
  const fileType = sniffFileType(buffer);

  if (fileType === "xlsx") {
    // The golf booking platform's ledger can also be exported as a genuine
    // .xlsx rather than the CSV/disguised-text form — check for it first;
    // Net Meter is the only other known genuine-.xlsx report.
    const golfResult = await tryParseGolfXlsx(buffer);
    if (golfResult) return { type: "golf", result: golfResult };

    const result = await parseNetmeterXlsx(buffer);
    return { type: "netmeter", result };
  }

  if (fileType === "text") {
    const text = buffer.toString("utf-8");
    if (GOLF_LEDGER_HEADER.test(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)) {
      return { type: "golf", result: parseGolfLedger(text) };
    }
    // A disguised .xlsx that's actually tab-delimited text — only other
    // known source of this is Net Meter.
    const result = parseNetmeterText(text);
    return { type: "netmeter", result };
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

  // Maxgaming's "Daily Report" export — distinguished from the per-machine
  // Net Meter PDF by its unique "Carded Gaming" / "Carded Spend" sections.
  if (/Carded Gaming/i.test(fullText) && /Carded Spend/i.test(fullText)) {
    return { type: "maxgaming_daily", result: parseMaxgamingDaily(fullText) };
  }

  // Only remaining known PDF report type.
  return { type: "netmeter", result: parseNetmeterPdfPages(pages) };
}
