"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VENUE_ID } from "@/lib/revenue/constants";

const SOURCE_BY_DOCUMENT_TYPE: Record<string, string> = {
  swiftpos: "parsed_swiftpos",
  netmeter: "parsed_netmeter",
  rms: "parsed_rms",
};

export async function upsertDailyActual(
  tradeDate: string,
  revenueLineId: string,
  value: number | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (value === null) {
    const { error } = await supabase
      .from("rev_daily_actuals")
      .delete()
      .eq("trade_date", tradeDate)
      .eq("revenue_line_id", revenueLineId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("rev_daily_actuals").upsert(
      {
        venue_id: VENUE_ID,
        trade_date: tradeDate,
        revenue_line_id: revenueLineId,
        value,
        source: "manual",
        entered_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trade_date,revenue_line_id" }
    );
    if (error) throw error;
  }

  revalidatePath("/");
}

export async function updateParsedLineItem(itemId: string, correctedValue: number | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rev_parsed_line_items")
    .update({ corrected_value: correctedValue })
    .eq("id", itemId);
  if (error) throw error;
}

export async function commitSourceDocument(documentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: doc, error: docError } = await supabase
    .from("rev_source_documents")
    .select("id, type, status")
    .eq("id", documentId)
    .single();
  if (docError || !doc) throw new Error(docError?.message ?? "Document not found");
  if (doc.status !== "pending_review") throw new Error("Document already reviewed");

  const { data: items, error: itemsError } = await supabase
    .from("rev_parsed_line_items")
    .select("trade_date, revenue_line_id, extracted_value, corrected_value")
    .eq("source_document_id", documentId);
  if (itemsError) throw itemsError;

  const source = SOURCE_BY_DOCUMENT_TYPE[doc.type] ?? "manual";

  const rows = (items ?? []).map((item) => ({
    venue_id: VENUE_ID,
    trade_date: item.trade_date,
    revenue_line_id: item.revenue_line_id,
    value: item.corrected_value ?? item.extracted_value,
    source,
    source_document_id: documentId,
    entered_by: user.id,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("rev_daily_actuals")
    .upsert(rows, { onConflict: "trade_date,revenue_line_id" });
  if (upsertError) throw upsertError;

  const { error: statusError } = await supabase
    .from("rev_source_documents")
    .update({ status: "committed" })
    .eq("id", documentId);
  if (statusError) throw statusError;

  revalidatePath("/");
  redirect("/");
}

export async function rejectSourceDocument(documentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rev_source_documents")
    .update({ status: "rejected" })
    .eq("id", documentId);
  if (error) throw error;

  redirect("/upload");
}
