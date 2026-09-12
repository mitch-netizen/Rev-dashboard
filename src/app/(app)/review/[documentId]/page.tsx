import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReviewTable, { type ReviewLineItem } from "./review-table";

const TYPE_LABELS: Record<string, string> = {
  swiftpos: "SwiftPOS — Master Group Sales by Location",
  netmeter: "Net Meter (Gaming)",
  rms: "RMS Occupancy",
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("rev_source_documents")
    .select("id, type, filename, status, uploaded_at")
    .eq("id", documentId)
    .single();

  if (!doc) notFound();

  const { data: items } = await supabase
    .from("rev_parsed_line_items")
    .select(
      "id, trade_date, extracted_value, corrected_value, flag, revenue_line:rev_revenue_lines(label, unit, display_order)"
    )
    .eq("source_document_id", documentId)
    .order("trade_date");

  const lineItems: ReviewLineItem[] = (items ?? [])
    .map((item) => {
      const line = Array.isArray(item.revenue_line) ? item.revenue_line[0] : item.revenue_line;
      return {
        id: item.id,
        tradeDate: item.trade_date,
        lineLabel: line?.label ?? "Unknown line",
        unit: (line?.unit ?? "currency") as "currency" | "percent",
        displayOrder: line?.display_order ?? 0,
        extractedValue: Number(item.extracted_value),
        correctedValue: item.corrected_value === null ? null : Number(item.corrected_value),
        flag: item.flag,
      };
    })
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.displayOrder - b.displayOrder);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Review before saving</h1>
        <p className="text-sm text-neutral-500">
          {TYPE_LABELS[doc.type] ?? doc.type} · {doc.filename}
        </p>
        {doc.status !== "pending_review" && (
          <p className="mt-2 rounded bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">
            This document was already {doc.status}.
          </p>
        )}
      </div>

      <ReviewTable documentId={doc.id} items={lineItems} readOnly={doc.status !== "pending_review"} />
    </div>
  );
}
