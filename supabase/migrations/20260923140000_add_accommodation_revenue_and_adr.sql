-- Accommodation Revenue ($) and ADR are both derived from the same RMS
-- "Occupancy By No Group" report already relied on for Accommodation
-- Occupancy — no second RMS report needed. Revenue = RevPAR x Avail Rooms;
-- ADR = Revenue / Room Nights Sold (averaged across the week, like a rate).
do $$
declare
  v_venue_id uuid := '703bd4fa-74f2-44c7-a0cb-f7cd3c5c00d9';
begin
  insert into public.rev_revenue_lines (venue_id, key, label, unit, is_averaged, display_order) values
    (v_venue_id, 'accommodation_revenue', 'Accommodation Revenue', 'currency', false, 16),
    (v_venue_id, 'accommodation_adr', 'Accommodation ADR', 'currency', true, 17);
end $$;
