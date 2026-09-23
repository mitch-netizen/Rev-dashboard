# Revenue Dashboard — The Queens Hotel Gladstone

Replaces the Excel revenue tracking workbook: daily actuals, targets, and
historic reporting across the venue's revenue lines (Gaming, Main Bar,
Sports Bar, Bistro, South Gladstone, Gladstone Phillip St, Accommodation,
Golf).

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel
- Supabase (Postgres + Auth + Storage) — the existing "The Queens" project,
  shared with the Functions Manager app. Revenue tables are prefixed `rev_`
  and isolated by row-level security; see `supabase/migrations` for schema.
- `pdfjs-dist` for PDF text extraction, `exceljs` for the Golf ledger xlsx export

## Report parsers (`src/lib/parsers`)

Four source reports, sniffed by file content rather than trusted by
extension (`sniff.ts`):

- **SwiftPOS** "Master Group Sales by Location" (PDF) — trade date is the
  *start* of the Reporting Period, not the print/filename date.
- **Maxgaming Daily Report** (Gaming) — the venue's sole gaming source;
  Turnover/Revenue plus Card Usage % (gaming floor and POS) and New
  Members. Dated directly, no offset.
- **RMS** "Occupancy By No Group" (PDF) — Occ % is matched to the database
  by its literal date, never assumed to be "this week".
- **Golf** booking ledger export (CSV or genuine xlsx) — venue revenue is
  only the credits to account 4000.

All four were validated against real sample reports.

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
