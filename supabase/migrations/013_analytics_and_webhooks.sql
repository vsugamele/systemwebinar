-- =============================================
-- 013: WEBHOOKS AND WHATSAPP CONFIG
-- =============================================

-- Add webhook URL for pitch clicks
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Add WhatsApp integration details
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS whatsapp_api_url TEXT;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT;
