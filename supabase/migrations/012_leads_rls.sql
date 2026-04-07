-- Enable RLS on webi_leads and add public insert + owner full-access policies

ALTER TABLE webi_leads ENABLE ROW LEVEL SECURITY;

-- Anyone can register as a lead on an active or draft webinar
CREATE POLICY "public_insert_leads" ON webi_leads
  FOR INSERT WITH CHECK (
    webinar_id IN (SELECT id FROM webi_webinars WHERE status IN ('active', 'draft'))
  );

-- Project owners have full access to their leads
CREATE POLICY "owner_all_leads" ON webi_leads
  FOR ALL USING (
    project_id IN (SELECT id FROM webi_projects WHERE owner_id = auth.uid())
  );
