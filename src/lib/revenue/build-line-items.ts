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

  if (report.type === "rms") {
    const occId = lineIdByKey.get("accommodation_occupancy");
    const revenueId = lineIdByKey.get("accommodation_revenue");
    const adrId = lineIdByKey.get("accommodation_adr");
    const items: DraftLineItem[] = [];
    for (const day of report.result) {
      if (occId) items.push({ tradeDate: day.date, revenueLineId: occId, extractedValue: day.occPercent });
      if (revenueId) items.push({ tradeDate: day.date, revenueLineId: revenueId, extractedValue: day.revenue });
      if (adrId && day.adr !== null) items.push({ tradeDate: day.date, revenueLineId: adrId, extractedValue: day.adr });
    }
    return items;
  }

  if (report.type === "maxgaming_daily") {
    const turnoverId = lineIdByKey.get("gaming_turnover");
    const revenueId = lineIdByKey.get("gaming_revenue");
    const gamingId = lineIdByKey.get("card_usage_gaming");
    const posId = lineIdByKey.get("card_usage_pos");
    const membersId = lineIdByKey.get("new_members");
    const { date, turnover, revenue, cardUsageGamingPercent, cardUsagePosPercent, newMembers } = report.result;
    const items: DraftLineItem[] = [];
    if (turnoverId) items.push({ tradeDate: date, revenueLineId: turnoverId, extractedValue: turnover });
    if (revenueId) items.push({ tradeDate: date, revenueLineId: revenueId, extractedValue: revenue });
    if (gamingId) items.push({ tradeDate: date, revenueLineId: gamingId, extractedValue: cardUsageGamingPercent });
    if (posId) items.push({ tradeDate: date, revenueLineId: posId, extractedValue: cardUsagePosPercent });
    if (membersId) items.push({ tradeDate: date, revenueLineId: membersId, extractedValue: newMembers });
    return items;
  }

  // golf
  const golfId = lineIdByKey.get("golf");
  if (!golfId) return [];
  return report.result.map((day) => ({
    tradeDate: day.date,
    revenueLineId: golfId,
    extractedValue: day.revenue,
  }));
}
