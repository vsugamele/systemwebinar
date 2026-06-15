-- Allow admins to pin the pitch minute used by video analytics.
ALTER TABLE webi_webinars
ADD COLUMN IF NOT EXISTS analytics_pitch_minute INTEGER;
