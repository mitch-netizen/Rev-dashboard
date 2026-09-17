import type { SupabaseClient } from "@supabase/supabase-js";
import { VENUE_ID } from "./constants";
import { detectAndParse } from "@/lib/parsers/detect";
import { buildLineItems } from "./build-line-items";

const SOURCE_BY_DOCUMENT_TYPE: Record<string, string> = {
  swiftpos: "parsed_swiftpos",
  netmeter: "parsed_netmeter",
  rms: "parsed_rms",
  golf: "parsed_golf",
};

// Shared by the browser upload endpoint and the inbound-email endpoint: both
// just get a file into the venue's hands, detect+parse it, and save it
// straight to rev_daily_actuals — no human review step. Figures can still be
// corrected afterwards on the Current Week grid, which is what drives every
// downstream report.
export async function ingestReportFile(
  supabase: SupabaseClient,
  buffer: Buffer,
  filename: string,
  contentType: string,
  uploadedBy: string | null
): Promise<{ documentId: string }> {
  const report = await detectAndParse(buffer);

  const [{ data: revenueLines }, { data: posLocations }] = await Promise.all([
    supabase.from("rev_revenue_lines").select("id, key").eq("venue_id", VENUE_ID),
    supabase
      .from("rev_pos_location_mapping")
      .select("pos_location_number, liquor_line_id, food_line_id")
      .eq("venue_id", VENUE_ID),
  ]);

  const lineItems = buildLineItems(report, revenueLines ?? [], posLocations ?? []);
  if (lineItems.length === 0) {
    throw new Error("Parsed the file but found no revenue lines to import — check the report content");
  }

  const storagePath = `${VENUE_ID}/${report.type}/${Date.now()}-${filename}`;
  const { error: storageError } = await supabase.storage
    .from("revenue-source-documents")
    .upload(storagePath, buffer, { contentType: contentType || "application/octet-stream" });
  if (storageError) throw storageError;

  const { data: sourceDoc, error: docError } = await supabase
    .from("rev_source_documents")
    .insert({
      venue_id: VENUE_ID,
      type: report.type,
      filename,
      storage_path: storagePath,
      uploaded_by: uploadedBy,
      status: "committed",
      raw_extracted: report.result,
    })
    .select("id")
    .single();
  if (docError || !sourceDoc) throw new Error(docError?.message ?? "Failed to save source document");

  // Kept for audit/history (what did we extract from this file), even though
  // nothing reads it as a to-do list anymore.
  const { error: itemsError } = await supabase.from("rev_parsed_line_items").insert(
    lineItems.map((item) => ({
      source_document_id: sourceDoc.id,
      trade_date: item.tradeDate,
      revenue_line_id: item.revenueLineId,
      extracted_value: item.extractedValue,
    }))
  );
  if (itemsError) throw itemsError;

  const source = SOURCE_BY_DOCUMENT_TYPE[report.type] ?? "manual";
  const { error: actualsError } = await supabase.from("rev_daily_actuals").upsert(
    lineItems.map((item) => ({
      venue_id: VENUE_ID,
      trade_date: item.tradeDate,
      revenue_line_id: item.revenueLineId,
      value: item.extractedValue,
      source,
      source_document_id: sourceDoc.id,
      entered_by: uploadedBy,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "trade_date,revenue_line_id" }
  );
  if (actualsError) throw actualsError;

  return { documentId: sourceDoc.id };
}
