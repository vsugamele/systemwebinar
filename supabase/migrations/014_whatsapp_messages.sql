-- =============================================
-- 014: WHATSAPP NATIVE MESSAGES CONFIG
-- =============================================

-- Add whatsapp custom messages
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS whatsapp_welcome_message TEXT;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS whatsapp_pitch_message TEXT;
