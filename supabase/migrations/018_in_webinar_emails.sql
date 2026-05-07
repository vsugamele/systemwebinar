-- =============================================
-- 018: IN-WEBINAR EMAILS
-- =============================================

ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS in_webinar_emails JSONB DEFAULT '[]'::jsonb;
