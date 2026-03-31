-- =============================================
-- 004: SESSION CLOCK, VIEWER CURVE, CHAT TAB
-- =============================================

-- Absolute wall-clock moment the current session began.
-- NULL = evergreen (each viewer starts from second 0, legacy behavior)
-- SET  = all viewers seek to the correct elapsed position (synchronized)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;

-- Viewer curve config (4-phase curve replaces simple random walk between min/max)
--   fake_viewers_start    : viewers visible at t=0
--   fake_viewers_peak     : peak viewers (top of the curve)
--   fake_viewers_end      : viewers at the end of the video
--   fake_viewers_peak_at_pct : % of video duration where peak occurs (0-100)
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS fake_viewers_start     INTEGER DEFAULT 50;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS fake_viewers_peak      INTEGER DEFAULT 500;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS fake_viewers_end       INTEGER DEFAULT 150;
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS fake_viewers_peak_at_pct INTEGER DEFAULT 30;

-- Default active tab in the chat panel ('chat' | 'qa')
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_default_tab TEXT DEFAULT 'chat';
