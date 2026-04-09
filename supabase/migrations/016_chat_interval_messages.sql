-- =============================================
-- 016: CHAT INTERVAL MESSAGES
-- =============================================

ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_interval_messages INTEGER DEFAULT 1;
