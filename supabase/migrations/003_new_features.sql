-- =============================================
-- 003: NEW FEATURES - Tracking, Form Fields, Chat Config
-- =============================================

-- Tracking code per webinar (injected in <head> or <body>)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS tracking_head_code TEXT;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS tracking_body_code TEXT;

-- Custom registration form fields config (JSON array of field keys)
-- e.g. ["name","email","phone","whatsapp","cpf"]
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS form_fields JSONB DEFAULT '["name","email","phone"]'::jsonb;

-- Chat simulation config
-- chat_cpm: simulated messages per minute (0 = use timeline events only)
-- chat_names: JSON array of display names for the simulation pool
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_cpm INTEGER DEFAULT 0;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_names JSONB DEFAULT '[]'::jsonb;

-- Extra metadata storage for lead extra fields (cpf, whatsapp, custom fields)
ALTER TABLE webi_leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
