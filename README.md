# Revenue Dashboard — The Queens Hotel Gladstone

Replaces the Excel revenue tracking workbook: daily actuals, targets, and
historic reporting across the venue's 11 revenue lines (Gaming, Main Bar,
Sports Bar, Bistro, South Gladstone, Gladstone Phillip St, Accommodation).

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel
- Supabase (Postgres + Auth + Storage) — the existing "The Queens" project,
  shared with the Functions Manager app. Revenue tables are prefixed `rev_`
  and isolated by row-level security; see `supabase/migrations` for schema.
- `pdfjs-dist` for PDF text extraction, `exceljs` for the Net Meter xlsx report

## Report parsers (`src/lib/parsers`)

Three source reports, sniffed by file content rather than trusted by
extension (`sniff.ts`):

- **SwiftPOS** "Master Group Sales by Location" (PDF) — trade date is the
  *start* of the Reporting Period, not the print/filename date.
- **Net Meter** (Gaming) — genuine xlsx, disguised tab-delimited text, or a
  genuine multi-page PDF. Dated directly, no offset.
- **RMS** "Occupancy By No Group" (PDF) — Occ % is matched to the database
  by its literal date, never assumed to be "this week".

All three were validated against real sample reports. The tab-delimited
Net Meter variant and the multi-page PDF Net Meter variant are implemented
from spec but not yet verified against a real file — flag if either
misparses.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in from the Supabase project settings
npm run dev
```

## Upload flow

Every parsed report lands in a review screen (`/review/[documentId]`)
before anything is written to `rev_daily_actuals` — extracted figures are
editable, and the upload can be discarded instead of committed. Nothing is
auto-committed.
