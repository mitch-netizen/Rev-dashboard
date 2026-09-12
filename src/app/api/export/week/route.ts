export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWeekGridData } from "@/lib/revenue/week-grid-data";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week") ?? undefined;

  const { days, lines, actuals } = await fetchWeekGridData(supabase, week);

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Week");

  sheet.columns = [
    { header: "Revenue line", key: "line", width: 26 },
    ...days.map((d) => ({ header: d.label, key: d.date, width: 13 })),
  ];
  sheet.getRow(1).font = { bold: true };

  for (const line of lines) {
    const row: Record<string, string | number> = { line: line.label };
    for (const day of days) {
      const value = actuals[`${day.date}|${line.id}`];
      if (value !== undefined) row[day.date] = value;
    }
    const addedRow = sheet.addRow(row);
    const numFmt = line.unit === "percent" ? "0.0\"%\"" : "$#,##0";
    for (const day of days) {
      addedRow.getCell(day.date).numFmt = numFmt;
      addedRow.getCell(day.date).alignment = { horizontal: "right" };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="week-${days[0].date}.xlsx"`,
    },
  });
}
