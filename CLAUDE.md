# Notes for Claude

## SwiftPOS "Detailed Audit" CSV exports have duplicate lines

When analysing a SwiftPOS Detailed Audit CSV (ad-hoc, not the files the app's
own parsers handle), the export reliably contains duplicate line items —
observed at ~7% of rows across multiple exports. De-dupe by **full-row
equality**, not by `Transaction_Number` + `Receipt_Number` + `PLU_Number`
alone — a single receipt can legitimately carry a sale row and its own
discount/adjustment row sharing that exact composite key with different
`Qty`/`SalesEx`, so de-duping on the composite key collapses two real
records into one and silently drops data. Verified against a live export:
the composite key removed 996 rows against full-row's 337, and every one of
those extra 659 was a genuine sale/adjustment pair, not a duplicate.
