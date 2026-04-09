-- =============================================
-- 015: LEAD METADATA (UTMs)
-- =============================================

ALTER TABLE webi_leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
