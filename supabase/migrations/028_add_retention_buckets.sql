-- Aggregated video retention samples.
-- Keeps high-resolution watch data without storing every watch sample as a raw event.

create table if not exists webi_retention_buckets (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references webi_webinars(id) on delete cascade,
  project_id uuid not null references webi_projects(id) on delete cascade,
  session_id text not null,
  bucket_seconds integer not null default 5,
  bucket_start_seconds integer not null,
  watch_delta_seconds integer not null default 0,
  sample_count integer not null default 1,
  session_mode text,
  lead_email text,
  lead_name text,
  lead_phone text,
  user_agent text,
  timezone text,
  last_timestamp_video integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webi_retention_buckets_bucket_seconds_check check (bucket_seconds > 0),
  constraint webi_retention_buckets_bucket_start_check check (bucket_start_seconds >= 0),
  constraint webi_retention_buckets_unique unique (
    webinar_id,
    session_id,
    bucket_seconds,
    bucket_start_seconds
  )
);

create index if not exists idx_webi_retention_buckets_webinar_bucket
  on webi_retention_buckets (webinar_id, bucket_seconds, bucket_start_seconds);

create index if not exists idx_webi_retention_buckets_webinar_updated
  on webi_retention_buckets (webinar_id, updated_at desc);

create index if not exists idx_webi_retention_buckets_session
  on webi_retention_buckets (session_id);

create index if not exists idx_webi_retention_buckets_mode
  on webi_retention_buckets (webinar_id, session_mode)
  where session_mode is not null;

alter table webi_retention_buckets enable row level security;
