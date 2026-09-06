-- Seed the 11 revenue lines, 3 group targets, and SwiftPOS location mapping
-- for The Queens Hotel Gladstone.

do $$
declare
  v_venue_id uuid := '703bd4fa-74f2-44c7-a0cb-f7cd3c5c00d9';
begin
  insert into public.rev_revenue_lines (venue_id, key, label, unit, is_averaged, display_order) values
    (v_venue_id, 'gaming_turnover', 'Gaming Turnover', 'currency', false, 1),
    (v_venue_id, 'gaming_revenue', 'Gaming Revenue', 'currency', false, 2),
    (v_venue_id, 'main_bar_liquor', 'Main Bar Liquor', 'currency', false, 3),
    (v_venue_id, 'main_bar_food', 'Main Bar Food', 'currency', false, 4),
    (v_venue_id, 'sports_bar_liquor', 'Sports Bar Liquor', 'currency', false, 5),
    (v_venue_id, 'sports_bar_food', 'Sports Bar Food', 'currency', false, 6),
    (v_venue_id, 'bistro_liquor', 'Bistro Liquor', 'currency', false, 7),
    (v_venue_id, 'bistro_food', 'Bistro Food', 'currency', false, 8),
    (v_venue_id, 'south_gladstone_liquor', 'South Gladstone Liquor', 'currency', false, 9),
    (v_venue_id, 'phillip_st_liquor', 'Gladstone Phillip St Liquor', 'currency', false, 10),
    (v_venue_id, 'accommodation_occupancy', 'Accommodation Occupancy', 'percent', true, 11);

  insert into public.rev_revenue_line_groups (venue_id, key, label, display_order) values
    (v_venue_id, 'all_bars', 'All Bars', 1),
    (v_venue_id, 'all_food', 'All Food', 2),
    (v_venue_id, 'retail', 'Retail', 3);

  insert into public.rev_revenue_line_group_members (group_id, revenue_line_id)
  select g.id, l.id
  from public.rev_revenue_line_groups g
  join public.rev_revenue_lines l on l.venue_id = v_venue_id
  where g.venue_id = v_venue_id
    and (
      (g.key = 'all_bars' and l.key in ('main_bar_liquor', 'sports_bar_liquor', 'bistro_liquor'))
      or (g.key = 'all_food' and l.key in ('main_bar_food', 'sports_bar_food', 'bistro_food'))
      or (g.key = 'retail' and l.key in ('south_gladstone_liquor', 'phillip_st_liquor'))
    );

  insert into public.rev_pos_location_mapping (venue_id, pos_location_number, location_name, liquor_line_id, food_line_id)
  select v_venue_id, m.pos_location_number, m.location_name,
    (select id from public.rev_revenue_lines where venue_id = v_venue_id and key = m.liquor_key),
    (select id from public.rev_revenue_lines where venue_id = v_venue_id and key = m.food_key)
  from (values
    (1, 'Main Bar', 'main_bar_liquor', 'main_bar_food'),
    (2, 'Bistro', 'bistro_liquor', 'bistro_food'),
    (5, 'Sports Bar', 'sports_bar_liquor', 'sports_bar_food'),
    (8, 'South Gladstone', 'south_gladstone_liquor', null),
    (9, 'Gladstone Phillip St', 'phillip_st_liquor', null)
  ) as m(pos_location_number, location_name, liquor_key, food_key);
end $$;
