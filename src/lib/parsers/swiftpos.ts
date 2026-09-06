// SwiftPOS "Master Group Sales by Location" parser.
//
// The Reporting Period spans 6:00:00 AM to 5:59:59 AM the next calendar day,
// and the PDF is printed the morning after trading ends — so the *start* of
// the Reporting Period is the true trade date, never the print date.

export interface SwiftposLocationResult {
  posLocationNumber: number;
  locationName: string;
  liquorSalesExc: number | null;
  foodSalesExc: number | null;
}

export interface SwiftposParseResult {
  tradeDate: string; // ISO yyyy-mm-dd
  locations: SwiftposLocationResult[];
}

function parseMoney(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

// D/M/YYYY (Australian format) -> ISO yyyy-mm-dd
function auDateToIso(d: string, m: string, y: string): string {
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseSwiftpos(text: string): SwiftposParseResult {
  const periodMatch = text.match(
    /Reporting Period:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}:\d{2}\s*[AP]M\s+to/i
  );
  if (!periodMatch) {
    throw new Error("Could not find Reporting Period start date in SwiftPOS report");
  }
  const [, d, m, y] = periodMatch;
  const tradeDate = auDateToIso(d, m, y);

  const lines = text.split("\n");
  const locationHeaderRe = /^Location\s*:\s*(\d+)\s*-\s*(.+)$/;
  const lineItemRe =
    /^(\d+)\s+(LIQUOR|FOOD|SUNDRIES)\s+[\d,]+\s+\$-?[\d,.]+\s+\$-?[\d,.]+\s+\$(-?[\d,.]+)\s+\$-?[\d,.]+\s+-?[\d.]+%$/;

  const locations: SwiftposLocationResult[] = [];
  let current: SwiftposLocationResult | null = null;

  for (const line of lines) {
    const headerMatch = line.match(locationHeaderRe);
    if (headerMatch) {
      if (current) locations.push(current);
      current = {
        posLocationNumber: Number(headerMatch[1]),
        locationName: headerMatch[2].trim(),
        liquorSalesExc: null,
        foodSalesExc: null,
      };
      continue;
    }

    if (line.startsWith("Total for :")) {
      // end of this location's block
      continue;
    }

    if (line.startsWith("Total Reported:") || line.startsWith("Summary by Master Group")) {
      // everything from here on is the report-wide summary section, not
      // per-location data — stop before its LIQUOR/FOOD rows get mistaken
      // for another line item under the last location seen.
      break;
    }

    if (!current) continue;

    const itemMatch = line.match(lineItemRe);
    if (itemMatch) {
      const [, , label, salesExc] = itemMatch;
      const value = parseMoney(salesExc);
      if (label === "LIQUOR") current.liquorSalesExc = value;
      if (label === "FOOD") current.foodSalesExc = value;
      // SUNDRIES is not one of the tracked revenue lines — ignored.
    }
  }
  if (current) locations.push(current);

  if (locations.length === 0) {
    throw new Error("No location blocks found in SwiftPOS report");
  }

  return { tradeDate, locations };
}
