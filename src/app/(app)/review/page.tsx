import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VENUE_ID } from "@/lib/revenue/constants";

const TYPE_LABELS: Record<string, string> = {
  swiftpos: "SwiftPOS — Master Group Sales by Location",
  netmeter: "Net Meter (Gaming)",
  rms: "RMS Occupancy",
};

export default async function ReviewQueuePage() {
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("rev_source_documents")
    .select("id, type, filename, uploaded_at")
    .eq("venue_id", VENUE_ID)
    .eq("status", "pending_review")
    .order("uploaded_at", { ascending: false });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Review queue</h1>
        <p className="text-sm text-neutral-500">
          Reports waiting for a look before they&apos;re saved — whether dropped on{" "}
          <Link href="/upload" className="underline">
            Upload
          </Link>{" "}
          or arrived by email.
        </p>
      </div>

      {docs && docs.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-900 dark:border-neutral-800">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{doc.filename}</p>
                <p className="text-neutral-500">
                  {TYPE_LABELS[doc.type] ?? doc.type} ·{" "}
                  {new Date(doc.uploaded_at).toLocaleString("en-AU", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <Link href={`/review/${doc.id}`} className="font-medium text-neutral-900 underline dark:text-white">
                Review
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">Nothing waiting for review.</p>
      )}
    </div>
  );
}
