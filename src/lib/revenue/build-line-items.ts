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
    if (report.result.endDate && report.result.endDate !== report.result.tradeDate) {
      throw new Error(
        `Net Meter report spans multiple days (${report.result.tradeDate} to ${report.result.endDate}) — this is an aggregate over the period, not a single day's figure, and can't be imported as one day's Turnover/Revenue. Upload single-day reports only.`
      );
    }

    const turnoverId = lineIdByKey.get("gaming_turnover");
    const revenueId = lineIdByKey.get("gaming_revenue");
    const items: DraftLineItem[] = [];
    if (turnoverId) {
      items.push({
        tradeDate: report.result.tradeDate,
        revenueLineId: turnoverId,
        extractedValue: report.result.turnover,
      });
    }
    if (revenueId) {
      items.push({
        tradeDate: report.result.tradeDate,
        revenueLineId: revenueId,
        extractedValue: report.result.revenue,
      });
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
