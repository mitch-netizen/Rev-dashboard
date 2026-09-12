export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeRecoveryReport } from "@/lib/revenue/recovery";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week") ?? undefined;

  const { days, rows, isCurrentWeek, remainingDaysCount } = await computeRecoveryReport(supabase, week);

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Recovery");

  sheet.columns = [
    { header: "Area", key: "area", width: 26 },
    { header: "Weekly target", key: "weeklyTarget", width: 16 },
    { header: "Target to date", key: "accruedTarget", width: 16 },
    { header: "Actual to date", key: "accruedActual", width: 16 },
    { header: "Variance", key: "variance", width: 14 },
    { header: "Normal daily target (rest of week)", key: "normalRemainingDailyAvg", width: 26 },
    { header: "Extra needed per day", key: "catchUpPerDay", width: 18 },
    { header: "New required daily target", key: "requiredDailyAvgRemaining", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };

  const fmt = (unit: "currency" | "percent") => (unit === "percent" ? "0.0\"%\"" : "$#,##0");

  for (const r of rows) {
    const numFmt = fmt(r.area.unit);
    const row = sheet.addRow({
      area: r.area.label,
      weeklyTarget: r.weeklyTarget,
      accruedTarget: r.accruedTarget,
      accruedActual: r.accruedActual,
      variance: r.variance,
      normalRemainingDailyAvg: r.remainingDaysCount > 0 ? r.normalRemainingDailyAvg : null,
      catchUpPerDay: r.remainingDaysCount > 0 && r.isBehind ? r.catchUpPerDay : r.remainingDaysCount > 0 ? 0 : null,
      requiredDailyAvgRemaining: r.remainingDaysCount > 0 ? r.requiredDailyAvgRemaining : null,
    });
    ["weeklyTarget", "accruedTarget", "accruedActual", "variance", "normalRemainingDailyAvg", "catchUpPerDay", "requiredDailyAvgRemaining"].forEach(
      (key) => {
        row.getCell(key).numFmt = numFmt;
      }
    );
    if (r.area.kind === "group") row.font = { bold: true };
    if (r.variance !== null && r.variance < -0.005) {
      row.getCell("variance").font = { color: { argb: "FFDC2626" } };
    }
  }

  sheet.getColumn("area").alignment = { horizontal: "left" };
  for (const key of ["weeklyTarget", "accruedTarget", "accruedActual", "variance", "normalRemainingDailyAvg", "catchUpPerDay", "requiredDailyAvgRemaining"]) {
    sheet.getColumn(key).alignment = { horizontal: "right" };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const label = isCurrentWeek ? "current-week" : days[0].date;

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="recovery-${label}-${remainingDaysCount}d-left.xlsx"`,
    },
  });
}
