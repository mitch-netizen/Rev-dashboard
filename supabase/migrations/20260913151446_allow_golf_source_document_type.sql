-- Widen the source-document/actuals type constraints to allow the new
-- Golf ledger CSV to flow through the same upload → review → commit
-- pipeline as SwiftPOS/Net Meter/RMS.
alter table public.rev_source_documents
  drop constraint rev_source_documents_type_check,
  add constraint rev_source_documents_type_check
    check (type = any (array['swiftpos'::text, 'netmeter'::text, 'rms'::text, 'golf'::text]));

alter table public.rev_daily_actuals
  drop constraint rev_daily_actuals_source_check,
  add constraint rev_daily_actuals_source_check
    check (source = any (array['manual'::text, 'parsed_swiftpos'::text, 'parsed_netmeter'::text, 'parsed_rms'::text, 'parsed_golf'::text]));
