-- Free-text notes for the Weekly Management Report, one row per week. Kept
-- as a single jsonb blob keyed by field id (matching the Jotform's own
-- question ids) rather than a column per question, since the question list
-- is maintained in application code and already changes shape there.
create table public.rev_weekly_report_notes (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null unique references public.rev_weeks(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.rev_weekly_report_notes enable row level security;

create policy rev_weekly_report_notes_select on public.rev_weekly_report_notes for select
  using (week_id in (select id from public.rev_weeks where venue_id in (select public.auth_venue_ids())));
create policy rev_weekly_report_notes_write on public.rev_weekly_report_notes for all
  using (week_id in (select id from public.rev_weeks w where public.auth_venue_role(w.venue_id) in ('admin', 'functions_manager')))
  with check (week_id in (select id from public.rev_weeks w where public.auth_venue_role(w.venue_id) in ('admin', 'functions_manager')));
