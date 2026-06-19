-- Webhook diagnostic logs for troubleshooting external integrations.

create table if not exists webi_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid references webi_webinars(id) on delete cascade not null,
  event_type text not null,
  webhook_url text not null,
  payload jsonb,
  response_status integer,
  response_body text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table webi_webhook_logs enable row level security;

-- Drop existing policies if they exist (to be safe)
drop policy if exists "anyone_read_webhook_logs" on webi_webhook_logs;
drop policy if exists "anyone_insert_webhook_logs" on webi_webhook_logs;

-- Recreate policies
create policy "anyone_read_webhook_logs" on webi_webhook_logs for select using (true);
create policy "anyone_insert_webhook_logs" on webi_webhook_logs for insert with check (true);

-- Add index for query performance
create index if not exists webi_webhook_logs_webinar_idx on webi_webhook_logs(webinar_id);

-- Enable Realtime for the table so it broadcasts updates
alter publication supabase_realtime add table webi_webhook_logs;
