-- Revenue dashboard schema for The Queens Hotel Gladstone.
-- Lives in the existing "The Queens" Supabase project, prefixed `rev_` to
-- stay isolated from the functions/events CRM tables (no shared PostgREST
-- schema-exposure config to touch on shared infra). References
-- public.venues / public.venue_users / public.profiles for venue + auth.

-- day_of_week convention throughout: 0 = Monday ... 6 = Sunday

create table public.rev_revenue_lines (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  key text not null,
  label text not null,
  unit text not null check (unit in ('currency', 'percent')),
  is_averaged boolean not null default false,
  display_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, key)
);

create table public.rev_revenue_line_groups (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  key text not null,
  label text not null,
  display_order int not null,
  unique (venue_id, key)
);

create table public.rev_revenue_line_group_members (
  group_id uuid not null references public.rev_revenue_line_groups(id) on delete cascade,
  revenue_line_id uuid not null references public.rev_revenue_lines(id) on delete cascade,
  primary key (group_id, revenue_line_id)
);

create table public.rev_pos_location_mapping (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  pos_location_number int not null,
  location_name text not null,
  liquor_line_id uuid references public.rev_revenue_lines(id),
  food_line_id uuid references public.rev_revenue_lines(id),
  active boolean not null default true,
  unique (venue_id, pos_location_number)
);

create table public.rev_weeks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  week_start_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (venue_id, week_start_date)
);

create table public.rev_source_documents (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  type text not null check (type in ('swiftpos', 'netmeter', 'rms')),
  filename text not null,
  storage_path text not null,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  status text not null default 'pending_review' check (status in ('pending_review', 'committed', 'rejected')),
  raw_extracted jsonb
);

create table public.rev_parsed_line_items (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.rev_source_documents(id) on delete cascade,
  trade_date date not null,
  revenue_line_id uuid not null references public.rev_revenue_lines(id),
  extracted_value numeric(12, 2) not null,
  corrected_value numeric(12, 2),
  flag text not null default 'ok' check (flag in ('ok', 'low_confidence'))
);

create table public.rev_daily_actuals (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  trade_date date not null,
  revenue_line_id uuid not null references public.rev_revenue_lines(id),
  value numeric(12, 2) not null,
  source text not null check (source in ('manual', 'parsed_swiftpos', 'parsed_netmeter', 'parsed_rms')),
  source_document_id uuid references public.rev_source_documents(id),
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (trade_date, revenue_line_id)
);

-- Standing weekly target pattern. Changing this never touches history --
-- rev_weekly_targets below is what's actually frozen per week.
create table public.rev_standing_targets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  revenue_line_id uuid references public.rev_revenue_lines(id),
  group_id uuid references public.rev_revenue_line_groups(id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  amount numeric(12, 2) not null,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check ((revenue_line_id is not null) <> (group_id is not null))
);

-- only one "current" (effective_to is null) row per line/day and per group/day
create unique index rev_standing_targets_current_line
  on public.rev_standing_targets (venue_id, revenue_line_id, day_of_week)
  where effective_to is null and revenue_line_id is not null;
create unique index rev_standing_targets_current_group
  on public.rev_standing_targets (venue_id, group_id, day_of_week)
  where effective_to is null and group_id is not null;

-- Frozen target-at-the-time for a given week, seeded from rev_standing_targets
-- when the week opens. Never recalculated when the standing pattern changes.
create table public.rev_weekly_targets (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.rev_weeks(id) on delete cascade,
  revenue_line_id uuid references public.rev_revenue_lines(id),
  group_id uuid references public.rev_revenue_line_groups(id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  amount numeric(12, 2) not null,
  source text not null check (source in ('standing_pattern', 'override')),
  check ((revenue_line_id is not null) <> (group_id is not null))
);

create unique index rev_weekly_targets_line
  on public.rev_weekly_targets (week_id, revenue_line_id, day_of_week)
  where revenue_line_id is not null;
create unique index rev_weekly_targets_group
  on public.rev_weekly_targets (week_id, group_id, day_of_week)
  where group_id is not null;

create index rev_daily_actuals_trade_date_idx on public.rev_daily_actuals (trade_date);
create index rev_parsed_line_items_source_doc_idx on public.rev_parsed_line_items (source_document_id);
create index rev_source_documents_venue_status_idx on public.rev_source_documents (venue_id, status);

-- RLS: reuse the existing public.auth_venue_ids() / public.auth_venue_role()
-- helpers so venue membership and roles stay in one place across both apps.

alter table public.rev_revenue_lines enable row level security;
alter table public.rev_revenue_line_groups enable row level security;
alter table public.rev_revenue_line_group_members enable row level security;
alter table public.rev_pos_location_mapping enable row level security;
alter table public.rev_weeks enable row level security;
alter table public.rev_source_documents enable row level security;
alter table public.rev_parsed_line_items enable row level security;
alter table public.rev_daily_actuals enable row level security;
alter table public.rev_standing_targets enable row level security;
alter table public.rev_weekly_targets enable row level security;

-- reference/config tables: any venue member can read, editors (admin/manager) can write
create policy rev_revenue_lines_select on public.rev_revenue_lines for select
  using (venue_id in (select public.auth_venue_ids()));
create policy rev_revenue_lines_write on public.rev_revenue_lines for all
  using (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'))
  with check (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'));

create policy rev_revenue_line_groups_select on public.rev_revenue_line_groups for select
  using (venue_id in (select public.auth_venue_ids()));
create policy rev_revenue_line_groups_write on public.rev_revenue_line_groups for all
  using (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'))
  with check (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'));

create policy rev_revenue_line_group_members_select on public.rev_revenue_line_group_members for select
  using (group_id in (select id from public.rev_revenue_line_groups where venue_id in (select public.auth_venue_ids())));
create policy rev_revenue_line_group_members_write on public.rev_revenue_line_group_members for all
  using (group_id in (select id from public.rev_revenue_line_groups g where public.auth_venue_role(g.venue_id) in ('admin', 'manager')))
  with check (group_id in (select id from public.rev_revenue_line_groups g where public.auth_venue_role(g.venue_id) in ('admin', 'manager')));

create policy rev_pos_location_mapping_select on public.rev_pos_location_mapping for select
  using (venue_id in (select public.auth_venue_ids()));
create policy rev_pos_location_mapping_write on public.rev_pos_location_mapping for all
  using (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) = 'admin')
  with check (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) = 'admin');

-- operational tables: any venue member can read, admin/manager/coordinator can write
create policy rev_weeks_select on public.rev_weeks for select
  using (venue_id in (select public.auth_venue_ids()));
create policy rev_weeks_write on public.rev_weeks for all
  using (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'))
  with check (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'));

create policy rev_source_documents_select on public.rev_source_documents for select
  using (venue_id in (select public.auth_venue_ids()));
create policy rev_source_documents_write on public.rev_source_documents for all
  using (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager', 'coordinator'))
  with check (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager', 'coordinator'));

create policy rev_parsed_line_items_select on public.rev_parsed_line_items for select
  using (source_document_id in (select id from public.rev_source_documents where venue_id in (select public.auth_venue_ids())));
create policy rev_parsed_line_items_write on public.rev_parsed_line_items for all
  using (source_document_id in (select id from public.rev_source_documents d where public.auth_venue_role(d.venue_id) in ('admin', 'manager', 'coordinator')))
  with check (source_document_id in (select id from public.rev_source_documents d where public.auth_venue_role(d.venue_id) in ('admin', 'manager', 'coordinator')));

create policy rev_daily_actuals_select on public.rev_daily_actuals for select
  using (venue_id in (select public.auth_venue_ids()));
create policy rev_daily_actuals_write on public.rev_daily_actuals for all
  using (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager', 'coordinator'))
  with check (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager', 'coordinator'));

create policy rev_standing_targets_select on public.rev_standing_targets for select
  using (venue_id in (select public.auth_venue_ids()));
create policy rev_standing_targets_write on public.rev_standing_targets for all
  using (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'))
  with check (venue_id in (select public.auth_venue_ids()) and public.auth_venue_role(venue_id) in ('admin', 'manager'));

create policy rev_weekly_targets_select on public.rev_weekly_targets for select
  using (week_id in (select id from public.rev_weeks where venue_id in (select public.auth_venue_ids())));
create policy rev_weekly_targets_write on public.rev_weekly_targets for all
  using (week_id in (select id from public.rev_weeks w where public.auth_venue_role(w.venue_id) in ('admin', 'manager')))
  with check (week_id in (select id from public.rev_weeks w where public.auth_venue_role(w.venue_id) in ('admin', 'manager')));
