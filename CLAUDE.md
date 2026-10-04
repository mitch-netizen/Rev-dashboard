# Notes for Claude

## SwiftPOS "Detailed Audit" CSV exports have duplicate lines

When analysing a SwiftPOS Detailed Audit CSV (ad-hoc, not the files the app's
own parsers handle), the export reliably contains duplicate line items —
observed at ~7% of rows across multiple exports. De-dupe by
`Transaction_Number` + `Receipt_Number` + `PLU_Number` (keep one row per
combination), not by full-row equality — some duplicate pairs can differ in
incidental columns (e.g. post-date timestamps) even though they're the same
underlying sale.
