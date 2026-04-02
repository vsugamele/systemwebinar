-- =============================================
-- LIVE WEBINAR CHAT SYSTEM
-- =============================================

create table if not exists webi_live_chat (
  id uuid primary key default uuid_generate_v4(),
  webinar_id uuid references webi_webinars(id) on delete cascade not null,
  session_id text not null,
  author text not null,
  text text not null,
  timestamp_video integer not null,
  is_simulated boolean default false,
  is_broadcast boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table webi_live_chat enable row level security;

-- Performance index
create index if not exists webi_live_chat_webinar_idx on webi_live_chat(webinar_id, timestamp_video);

-- Policies
-- Participants can read chat for active webinars
create policy "anyone_read_chat" on webi_live_chat
  for select using (
    webinar_id in (select id from webi_webinars where status = 'active')
  );

-- Participants can insert chat inside an active webinar
create policy "anyone_insert_chat" on webi_live_chat
  for insert with check (
    webinar_id in (select id from webi_webinars where status = 'active')
  );

-- Enable Replication for Realtime Subscriptions
alter publication supabase_realtime add table webi_live_chat;
