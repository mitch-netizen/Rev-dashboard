-- Liquor GP % tracked as two blended figures — On Premise (Main Bar, Sports
-- Bar, Bistro) and Off Premise (South Gladstone, Gladstone Phillip St) —
-- rather than per-location, since a meaningful GP% needs to be computed as
-- sum(GP $) / sum(Sales Exc) across the locations in each bucket, not an
-- average of each location's own GP%. `premise` on the POS mapping table
-- drives that bucketing so it stays data-driven like every other
-- location-to-line mapping here, not hardcoded in application code.

alter table public.rev_pos_location_mapping
  add column premise text check (premise in ('on', 'off'));

do $$
declare
  v_venue_id uuid := '703bd4fa-74f2-44c7-a0cb-f7cd3c5c00d9';
begin
  update public.rev_pos_location_mapping
  set premise = case pos_location_number
    when 1 then 'on'   -- Main Bar
    when 2 then 'on'   -- Bistro
    when 5 then 'on'   -- Sports Bar
    when 8 then 'off'  -- South Gladstone
    when 9 then 'off'  -- Gladstone Phillip St
  end
  where venue_id = v_venue_id;

  insert into public.rev_revenue_lines (venue_id, key, label, unit, is_averaged, display_order) values
    (v_venue_id, 'liquor_gp_on_premise', 'Liquor GP % — On Premise', 'percent', true, 18),
    (v_venue_id, 'liquor_gp_off_premise', 'Liquor GP % — Off Premise', 'percent', true, 19);
end $$;

-- Left nullable rather than NOT NULL: this table is shaped for multiple
-- venues (venue_id column) even though only one is live today, and a
-- table-wide NOT NULL would reach rows this migration doesn't know about.
-- build-line-items.ts treats a null premise as "not bucketed" and simply
-- skips that location for the on/off-premise GP% figures.
