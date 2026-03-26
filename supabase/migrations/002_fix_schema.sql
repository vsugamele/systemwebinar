-- =============================================
-- FIX NAMESPACES AND ADD EMAIL TEMPLATES
-- =============================================

-- Rename tables generated without webi_ prefix
ALTER TABLE IF EXISTS projects RENAME TO webi_projects;
ALTER TABLE IF EXISTS webinars RENAME TO webi_webinars;
ALTER TABLE IF EXISTS webinar_events RENAME TO webi_events;
ALTER TABLE IF EXISTS leads RENAME TO webi_leads;
ALTER TABLE IF EXISTS session_events RENAME TO webi_session_events;

-- Rename some indexes
ALTER INDEX IF EXISTS session_events_webinar_idx RENAME TO webi_session_events_webinar_idx;
ALTER INDEX IF EXISTS session_events_session_idx RENAME TO webi_session_events_session_idx;
ALTER INDEX IF EXISTS leads_email_webinar_idx RENAME TO webi_leads_email_webinar_idx;

-- =============================================
-- EMAIL TEMPLATES
-- =============================================
create table if not exists webi_email_templates (
  id uuid primary key default uuid_generate_v4(),
  webinar_id uuid references webi_webinars(id) on delete cascade not null,
  type text not null check (type in ('confirmation', 'reminder_48h', 'reminder_24h', 'reminder_15min', 'followup', 'replay')),
  subject text not null,
  body text not null,
  delay_minutes integer not null,
  enabled boolean default true,
  created_at timestamptz default now()
);

alter table webi_email_templates enable row level security;

create policy "email_templates_owner" on webi_email_templates
  for all using (
    webinar_id in (
      select w.id from webi_webinars w
      join webi_projects p on p.id = w.project_id
      where p.owner_id = auth.uid()
    )
  );
