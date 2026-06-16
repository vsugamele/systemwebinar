-- Webinar executions ("runs") for repeated live sessions.
-- A webinar can be reused weekly while metrics remain separated by each run.

create table if not exists webi_webinar_runs (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references webi_webinars(id) on delete cascade,
  project_id uuid not null references webi_projects(id) on delete cascade,
  title text,
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table webi_webinars
  add column if not exists current_run_id uuid references webi_webinar_runs(id) on delete set null;

alter table webi_session_events
  add column if not exists run_id uuid references webi_webinar_runs(id) on delete set null;

alter table webi_retention_buckets
  add column if not exists run_id uuid references webi_webinar_runs(id) on delete set null;

alter table webi_live_chat
  add column if not exists run_id uuid references webi_webinar_runs(id) on delete set null;

create index if not exists idx_webi_webinar_runs_webinar_started
  on webi_webinar_runs (webinar_id, started_at desc);

create index if not exists idx_webi_webinar_runs_project_started
  on webi_webinar_runs (project_id, started_at desc);

create index if not exists idx_webi_webinar_runs_active
  on webi_webinar_runs (webinar_id, status)
  where status = 'active';

create index if not exists idx_webi_session_events_run
  on webi_session_events (run_id, event_type, created_at desc)
  where run_id is not null;

create index if not exists idx_webi_retention_buckets_run
  on webi_retention_buckets (run_id, bucket_seconds, bucket_start_seconds)
  where run_id is not null;

create index if not exists idx_webi_live_chat_run
  on webi_live_chat (run_id, created_at desc)
  where run_id is not null;

alter table webi_webinar_runs enable row level security;

drop policy if exists "owner_all_webinar_runs" on webi_webinar_runs;
create policy "owner_all_webinar_runs" on webi_webinar_runs
  for all using (
    project_id in (select id from webi_projects where owner_id = auth.uid())
  )
  with check (
    project_id in (select id from webi_projects where owner_id = auth.uid())
  );

