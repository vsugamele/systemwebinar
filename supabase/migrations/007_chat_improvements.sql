-- 007: Chat CPM improvements + Live scheduling
-- chat_mode: 'cpm' (existing) or 'interval' (1 msg every N minutes)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_mode TEXT DEFAULT 'cpm';

-- Used when chat_mode = 'interval'
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_interval_minutes NUMERIC DEFAULT 5;

-- Video second at which simulated chat starts (default: from the beginning)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_start_seconds INTEGER DEFAULT 0;

-- Video second at which simulated chat stops (NULL = until the end)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_end_seconds INTEGER;

-- Custom phrase pool as JSON array (NULL = use system defaults)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_phrases JSONB;

-- Scheduled start datetime for live sessions (NULL = manual start)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;
