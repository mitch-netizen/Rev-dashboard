-- Golf (bay bookings + club rentals, combined into one line) — a new revenue
-- source from the venue's golf-simulator bays. Sits alongside the Sports Bar
-- outlet operationally, but stays a standalone line (no group) since its
-- revenue shouldn't roll into the All Bars target.
do $$
declare
  v_venue_id uuid := '703bd4fa-74f2-44c7-a0cb-f7cd3c5c00d9';
begin
  insert into public.rev_revenue_lines (venue_id, key, label, unit, is_averaged, display_order)
  values (v_venue_id, 'golf', 'Golf', 'currency', false, 12);
end $$;
