-- Add run_id column to webi_leads table and update register_lead function.

ALTER TABLE webi_leads
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES webi_webinar_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_webi_leads_run_id
  ON webi_leads(run_id)
  WHERE run_id IS NOT NULL;

-- Drop old function signature to prevent duplicate overload issues
DROP FUNCTION IF EXISTS public.register_lead(uuid, uuid, text, text, text, jsonb);

-- Create new function signature including p_run_id
CREATE OR REPLACE FUNCTION public.register_lead(
  p_webinar_id uuid,
  p_project_id uuid,
  p_email text,
  p_name text,
  p_phone text,
  p_metadata jsonb DEFAULT NULL::jsonb,
  p_run_id uuid DEFAULT NULL::uuid
)
RETURNS webi_leads
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead webi_leads;
  v_run_id uuid := p_run_id;
BEGIN
  -- If p_run_id is not passed, lookup current_run_id from webi_webinars
  IF v_run_id IS NULL THEN
    SELECT current_run_id INTO v_run_id
    FROM webi_webinars
    WHERE id = p_webinar_id;
  END IF;

  INSERT INTO webi_leads (webinar_id, project_id, email, name, phone, metadata, run_id)
  VALUES (p_webinar_id, p_project_id, p_email, p_name, p_phone, p_metadata, v_run_id)
  ON CONFLICT (email, webinar_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    metadata = EXCLUDED.metadata,
    run_id = COALESCE(EXCLUDED.run_id, webi_leads.run_id)
  RETURNING * INTO v_lead;
  
  RETURN v_lead;
END;
$$;
