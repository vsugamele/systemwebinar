-- =============================================
-- 017: CHAT PHRASE POOLS
-- =============================================

ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_phrases_elogios JSONB;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_phrases_vaga JSONB;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_phrases_engajamento JSONB;
