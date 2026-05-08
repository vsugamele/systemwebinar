-- Add video orientation setting (horizontal = 16:9 default, vertical = 9:16 for portrait experts)
ALTER TABLE webi_webinars
  ADD COLUMN IF NOT EXISTS video_orientation text DEFAULT 'horizontal';
