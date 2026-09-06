export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VENUE_ID } from "@/lib/revenue/constants";
import { detectAndParse } from "@/lib/parsers/detect";
import { buildLineItems } from "@/lib/revenue/build-line-items";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let report;
  try {
    report = await detectAndParse(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse file" },
      { status: 422 }
    );
  }

  const [{ data: revenueLines }, { data: posLocations }] = await Promise.all([
    supabase.from("rev_revenue_lines").select("id, key").eq("venue_id", VENUE_ID),
    supabase
      .from("rev_pos_location_mapping")
      .select("pos_location_number, liquor_line_id, food_line_id")
      .eq("venue_id", VENUE_ID),
  ]);

  const lineItems = buildLineItems(report, revenueLines ?? [], posLocations ?? []);
  if (lineItems.length === 0) {
    return NextResponse.json(
      { error: "Parsed the file but found no revenue lines to import — check the report content" },
      { status: 422 }
    );
  }

  const storagePath = `${VENUE_ID}/${report.type}/${Date.now()}-${file.name}`;
  const { error: storageError } = await supabase.storage
    .from("revenue-source-documents")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
    });
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { data: sourceDoc, error: docError } = await supabase
    .from("rev_source_documents")
    .insert({
      venue_id: VENUE_ID,
      type: report.type,
      filename: file.name,
      storage_path: storagePath,
      uploaded_by: user.id,
      status: "pending_review",
      raw_extracted: report.result,
    })
    .select("id")
    .single();

  if (docError || !sourceDoc) {
    return NextResponse.json(
      { error: docError?.message ?? "Failed to save source document" },
      { status: 500 }
    );
  }

  const { error: itemsError } = await supabase.from("rev_parsed_line_items").insert(
    lineItems.map((item) => ({
      source_document_id: sourceDoc.id,
      trade_date: item.tradeDate,
      revenue_line_id: item.revenueLineId,
      extracted_value: item.extractedValue,
    }))
  );

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ documentId: sourceDoc.id });
}
