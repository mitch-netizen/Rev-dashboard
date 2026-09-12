import type { DetectedReport } from "@/lib/parsers/detect";

export interface DraftLineItem {
  tradeDate: string;
  revenueLineId: string;
  extractedValue: number;
}

interface RevenueLineRef {
  id: string;
  key: string;
}

interface PosLocationRef {
  pos_location_number: number;
  liquor_line_id: string | null;
  food_line_id: string | null;
}

export function buildLineItems(
  report: DetectedReport,
  revenueLines: RevenueLineRef[],
  posLocations: PosLocationRef[]
): DraftLineItem[] {
  const lineIdByKey = new Map(revenueLines.map((l) => [l.key, l.id]));

  if (report.type === "swiftpos") {
    const posMap = new Map(posLocations.map((p) => [p.pos_location_number, p]));
    const unmapped = report.result.locations
      .map((loc) => loc.posLocationNumber)
      .filter((num) => !posMap.has(num));
    if (unmapped.length > 0) {
      throw new Error(
        `SwiftPOS report has location number(s) with no POS mapping configured: ${unmapped.join(", ")}. Fix rev_pos_location_mapping before importing this report — a partial import would silently drop those locations' revenue.`
      );
    }

    const items: DraftLineItem[] = [];
    for (const loc of report.result.locations) {
      const mapping = posMap.get(loc.posLocationNumber)!;
      if (loc.liquorSalesExc !== null && mapping.liquor_line_id) {
        items.push({
          tradeDate: report.result.tradeDate,
          revenueLineId: mapping.liquor_line_id,
          extractedValue: loc.liquorSalesExc,
        });
      }
      if (loc.foodSalesExc !== null && mapping.food_line_id) {
        items.push({
          tradeDate: report.result.tradeDate,
          revenueLineId: mapping.food_line_id,
          extractedValue: loc.foodSalesExc,
        });
      }
    }
    return items;
  }

  if (report.type === "netmeter") {
    const turnoverId = lineIdByKey.get("gaming_turnover");
    const revenueId = lineIdByKey.get("gaming_revenue");
    const items: DraftLineItem[] = [];
    for (const day of report.result) {
      if (turnoverId) {
        items.push({ tradeDate: day.date, revenueLineId: turnoverId, extractedValue: day.turnover });
      }
      if (revenueId) {
        items.push({ tradeDate: day.date, revenueLineId: revenueId, extractedValue: day.revenue });
      }
    }
    return items;
  }

  // rms
  const occId = lineIdByKey.get("accommodation_occupancy");
  if (!occId) return [];
  return report.result.map((day) => ({
    tradeDate: day.date,
    revenueLineId: occId,
    extractedValue: day.occPercent,
  }));
}
