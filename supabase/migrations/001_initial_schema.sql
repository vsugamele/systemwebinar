-- =============================================
-- WEBINAR SYSTEM - Initial Database Schema
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- PROJECTS
-- =============================================
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  logo_url text,
  accent_color text default '#6366f1',
  custom_domain text,
  resend_from_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- WEBINARS
-- =============================================
create table if not exists webinars (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  description text,
  video_url text,
  thumbnail_url text,
  slug text unique not null,
  status text default 'draft' check (status in ('draft', 'active', 'paused')),
  evergreen_offset_seconds integer default 0,
  peak_viewers_min integer default 20,
  peak_viewers_max integer default 80,
  duration_seconds integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- WEBINAR EVENTS (timeline)
-- =============================================
create table if not exists webinar_events (
  id uuid primary key default uuid_generate_v4(),
  webinar_id uuid references webinars(id) on delete cascade not null,
  type text not null check (type in ('chat_message', 'offer_popup', 'pitch_button', 'hide_pitch_button', 'email_auto')),
  timestamp_seconds integer not null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);

-- =============================================
-- LEADS
-- =============================================
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  webinar_id uuid references webinars(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  email text not null,
  name text not null,
  phone text,
  attended boolean default false,
  registered_at timestamptz default now()
);

-- Prevent duplicate registrations
create unique index if not exists leads_email_webinar_idx on leads(email, webinar_id);

-- =============================================
-- SESSION EVENTS (analytics)
-- =============================================
create table if not exists session_events (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null,
  webinar_id uuid references webinars(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete set null,
  event_type text not null check (event_type in (
    'joined', 'watch_second', 'cta_clicked', 'cta_dismissed',
    'popup_seen', 'popup_dismissed', 'left', 'chat_sent'
  )),
  timestamp_video integer,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Index for analytics queries
create index if not exists session_events_webinar_idx on session_events(webinar_id, event_type);
create index if not exists session_events_session_idx on session_events(session_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table projects enable row level security;
alter table webinars enable row level security;
alter table webinar_events enable row level security;
alter table leads enable row level security;
alter table session_events enable row level security;

-- Projects: only owner can access
create policy "projects_owner" on projects
  for all using (auth.uid() = owner_id);

-- Webinars: owner via project
create policy "webinars_owner" on webinars
  for all using (
    project_id in (select id from projects where owner_id = auth.uid())
  );

-- Webinar events: owner via webinar
create policy "webinar_events_owner" on webinar_events
  for all using (
    webinar_id in (
      select w.id from webinars w
      join projects p on p.id = w.project_id
      where p.owner_id = auth.uid()
    )
  );

-- Webinar events: public read for active webinars
create policy "webinar_events_public_read" on webinar_events
  for select using (
    webinar_id in (select id from webinars where status = 'active')
  );

-- Leads: owner can read, anyone can insert (for registration)
create policy "leads_owner_read" on leads
  for select using (
    project_id in (select id from projects where owner_id = auth.uid())
  );

create policy "leads_public_insert" on leads
  for insert with check (true);

-- Session events: owner can read, service role inserts
create policy "session_events_owner_read" on session_events
  for select using (
    project_id in (select id from projects where owner_id = auth.uid())
  );

create policy "session_events_public_insert" on session_events
  for insert with check (true);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();

create trigger webinars_updated_at before update on webinars
  for each row execute function update_updated_at();

-- Webinars public read for active
create policy "webinars_public_read" on webinars
  for select using (status = 'active');
