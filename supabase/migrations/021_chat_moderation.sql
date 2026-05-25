-- =============================================
-- WEBINAR CHAT MODERATION & BANNING SYSTEM
-- =============================================

create table if not exists webi_banned_leads (
  id uuid primary key default uuid_generate_v4(),
  webinar_id uuid references webi_webinars(id) on delete cascade not null,
  lead_email text,
  session_id text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table webi_banned_leads enable row level security;

-- Performance index
create index if not exists webi_banned_leads_webinar_idx on webi_banned_leads(webinar_id);

-- Policies
create policy "anyone_read_banned_leads" on webi_banned_leads
  for select using (true);

create policy "anyone_insert_banned_leads" on webi_banned_leads
  for insert with check (true);

-- Enable Replication for Realtime Subscriptions
alter publication supabase_realtime add table webi_banned_leads;
