export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeRecoveryReport, type RecoveryRow, type RecoveryMemberRow } from "@/lib/revenue/recovery";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week") ?? undefined;

  const { days, sections, ungroupedRows, isCurrentWeek, remainingDaysCount } = await computeRecoveryReport(supabase, week);

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
  const numericKeys = [
    "weeklyTarget",
    "accruedTarget",
    "accruedActual",
    "variance",
    "normalRemainingDailyAvg",
    "catchUpPerDay",
    "requiredDailyAvgRemaining",
  ] as const;

  function addTargetRow(r: RecoveryRow, bold = false) {
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
    numericKeys.forEach((key) => {
      row.getCell(key).numFmt = numFmt;
    });
    if (bold) row.font = { bold: true };
    if (r.variance !== null && r.variance < -0.005) {
      row.getCell("variance").font = { color: { argb: "FFDC2626" } };
    }
  }

  // A group member has no target of its own, so only its label and actual
  // figure are written — the target/variance/catch-up columns stay blank
  // rather than showing a misleading $0 target.
  function addMemberRow(m: RecoveryMemberRow) {
    const row = sheet.addRow({ area: `    ${m.area.label}`, accruedActual: m.accruedActual });
    row.getCell("area").font = { italic: true, color: { argb: "FF737373" } };
    row.getCell("accruedActual").numFmt = fmt(m.area.unit);
    row.getCell("accruedActual").font = { color: { argb: "FF737373" } };
  }

  for (const section of sections) {
    if (section.kind === "standalone") {
      addTargetRow(section.row);
    } else {
      for (const m of section.group.members) addMemberRow(m);
      addTargetRow(section.group.row, true);
    }
  }

  if (ungroupedRows.length > 0) {
    sheet.addRow({});
    const header = sheet.addRow({ area: "No target set" });
    header.getCell("area").font = { bold: true, italic: true, color: { argb: "FF737373" } };
    for (const m of ungroupedRows) addMemberRow(m);
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
