-- Add theme field to webinars
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark'
  CHECK (theme IN ('dark', 'light', 'youtube'));
