-- Maxgaming "Daily Report" PDF as a new (additional, not replacing Net
-- Meter) upload source: Card Usage % for both the gaming floor and POS
-- tills, plus New Members as a plain count — none of these three are
-- covered by the existing Net Meter/RMS/SwiftPOS/Golf sources.

alter table public.rev_revenue_lines
  drop constraint rev_revenue_lines_unit_check,
  add constraint rev_revenue_lines_unit_check
    check (unit in ('currency', 'percent', 'count'));

alter table public.rev_source_documents
  drop constraint rev_source_documents_type_check,
  add constraint rev_source_documents_type_check
    check (type = any (array['swiftpos'::text, 'netmeter'::text, 'rms'::text, 'golf'::text, 'maxgaming_daily'::text]));

alter table public.rev_daily_actuals
  drop constraint rev_daily_actuals_source_check,
  add constraint rev_daily_actuals_source_check
    check (source = any (array['manual'::text, 'parsed_swiftpos'::text, 'parsed_netmeter'::text, 'parsed_rms'::text, 'parsed_golf'::text, 'parsed_maxgaming_daily'::text]));

do $$
declare
  v_venue_id uuid := '703bd4fa-74f2-44c7-a0cb-f7cd3c5c00d9';
begin
  insert into public.rev_revenue_lines (venue_id, key, label, unit, is_averaged, display_order) values
    -- Averaged across the week, never summed — a card-usage percentage is a
    -- rate, same treatment as Accommodation Occupancy.
    (v_venue_id, 'card_usage_gaming', 'Card Usage — Gaming', 'percent', true, 13),
    (v_venue_id, 'card_usage_pos', 'Card Usage — POS', 'percent', true, 14),
    -- A headcount, not a dollar figure or a rate — sums across the week like
    -- a normal currency line, just formatted as a plain number.
    (v_venue_id, 'new_members', 'New Members', 'count', false, 15);
end $$;
