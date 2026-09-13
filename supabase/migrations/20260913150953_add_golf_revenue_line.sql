-- Golf (bay bookings + club rentals, combined into one line) — a new revenue
-- source from the venue's golf-simulator bays. Grouped under All Bars since
-- the bays sit under the Sports Bar outlet, alongside Sports Bar Liquor.
do $$
declare
  v_venue_id uuid := '703bd4fa-74f2-44c7-a0cb-f7cd3c5c00d9';
  v_golf_line_id uuid;
begin
  insert into public.rev_revenue_lines (venue_id, key, label, unit, is_averaged, display_order)
  values (v_venue_id, 'golf', 'Golf', 'currency', false, 12)
  returning id into v_golf_line_id;

  insert into public.rev_revenue_line_group_members (group_id, revenue_line_id)
  select g.id, v_golf_line_id
  from public.rev_revenue_line_groups g
  where g.venue_id = v_venue_id and g.key = 'all_bars';
end $$;
