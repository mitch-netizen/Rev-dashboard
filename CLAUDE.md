# Notes for Claude

## SwiftPOS "Detailed Audit" CSV exports do NOT have duplicate lines — don't de-dupe

When analysing a SwiftPOS Detailed Audit CSV (ad-hoc, not a file type the
app's own parsers handle), rows that *look* like duplicates — identical
`Receipt_Number`/`Transaction_Number`/`PLU_Number`/`Description`, sometimes
every column — are real, distinct sales (e.g. two rounds of the same
schooner rung up separately within one open tab), not an export artifact.
**Use every row; do not de-dupe by full-row equality or by any key.**

How to verify this on any given export: `Sale_Total_Ex` is the whole
receipt's total, repeated identically on every line of that receipt (true
for 1393/1393 receipts checked). Summing each receipt's *raw, undeduped*
`SalesEx` and comparing to its `Sale_Total_Ex` matches for 1359/1393
receipts (97.6%) — summing the *de-duped* lines instead matches far worse,
because real repeat line items get discarded. The 34 raw mismatches seen
all had `Sale_Total_Ex = 0.000` despite non-zero real line items — a
separate, unrelated data-quality gap in that field, not a duplication
issue; flag these receipts rather than silently excluding them.

This reverses an earlier, wrong version of this note (see git history on
this file) that was never checked against `Sale_Total_Ex` and concluded
~7% of rows were duplicates. That full-row de-dupe silently dropped
$3,227.75 of real revenue (8.7% of the file's total) from a live export —
always cross-check a de-dup theory against a receipt-level total before
trusting it.
