import { sniffFileType } from "./sniff";
import { extractPdfText } from "./pdf-text";
import { parseSwiftpos, type SwiftposParseResult } from "./swiftpos";
import { parseRms, type RmsDayResult } from "./rms";
import {
  parseNetmeterXlsx,
  parseNetmeterText,
  parseNetmeterPdfPages,
  type NetmeterParseResult,
} from "./netmeter";

export type DetectedReport =
  | { type: "swiftpos"; result: SwiftposParseResult }
  | { type: "netmeter"; result: NetmeterParseResult }
  | { type: "rms"; result: RmsDayResult[] };

export async function detectAndParse(buffer: Buffer): Promise<DetectedReport> {
  const fileType = sniffFileType(buffer);

  if (fileType === "xlsx") {
    // The only known xlsx-native report is Net Meter.
    const result = await parseNetmeterXlsx(buffer);
    return { type: "netmeter", result };
  }

  if (fileType === "text") {
    // A disguised .xlsx that's actually tab-delimited text — only known
    // source of this is Net Meter.
    const result = parseNetmeterText(buffer.toString("utf-8"));
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

  // Only remaining known PDF report type.
  return { type: "netmeter", result: parseNetmeterPdfPages(pages) };
}
