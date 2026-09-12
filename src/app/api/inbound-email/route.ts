export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ingestReportFile } from "@/lib/revenue/ingest";

// Receives Postmark's inbound-webhook payload (https://postmarkapp.com/developer/webhooks/inbound-webhook):
// { From, Subject, Attachments: [{ Name, Content (base64), ContentType, ContentLength }], ... }
// Set up so daily emailed SwiftPOS/RMS reports (and a manually-exported Net
// Meter file, forwarded the same way) land straight in pending_review
// without anyone touching the /upload page — the report type is detected
// from content just like a browser upload, and nothing here ever commits to
// rev_daily_actuals, so the review step still can't be skipped.
interface InboundAttachment {
  Name: string;
  Content: string;
  ContentType: string;
}

interface InboundPayload {
  From?: string;
  Subject?: string;
  Attachments?: InboundAttachment[];
}

// Authenticated via HTTP Basic Auth embedded in the webhook URL
// (https://user:pass@your-app.vercel.app/api/inbound-email) — the standard
// way Postmark (and most inbound-email providers) support authenticating a
// webhook target, and it works the same regardless of which provider Mitch
// ends up on.
function isAuthorized(request: Request): boolean {
  const expectedUser = process.env.INBOUND_EMAIL_BASIC_USER;
  const expectedPassword = process.env.INBOUND_EMAIL_BASIC_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  return decoded.slice(0, separatorIndex) === expectedUser && decoded.slice(separatorIndex + 1) === expectedPassword;
}

// Skips things like inline signature images that ride along on a vendor
// email — only PDF/xlsx attachments are worth trying to parse.
function looksLikeReport(attachment: InboundAttachment): boolean {
  const name = attachment.Name.toLowerCase();
  return name.endsWith(".pdf") || name.endsWith(".xlsx") || name.endsWith(".xls");
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as InboundPayload;
  const attachments = (payload.Attachments ?? []).filter(looksLikeReport);

  if (attachments.length === 0) {
    return NextResponse.json({ processed: 0, message: "No report attachments found" });
  }

  const supabase = createServiceClient();

  const results = await Promise.all(
    attachments.map(async (attachment) => {
      const buffer = Buffer.from(attachment.Content, "base64");
      try {
        const { documentId } = await ingestReportFile(
          supabase,
          buffer,
          attachment.Name,
          attachment.ContentType,
          null
        );
        return { filename: attachment.Name, documentId };
      } catch (err) {
        console.error(`[inbound-email] failed to ingest "${attachment.Name}":`, err);
        return {
          filename: attachment.Name,
          error: err instanceof Error ? err.message : "Failed to parse file",
        };
      }
    })
  );

  return NextResponse.json({ processed: results.length, results });
}
