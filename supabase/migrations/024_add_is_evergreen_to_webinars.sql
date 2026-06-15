-- Add is_evergreen column to webi_webinars table
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS is_evergreen BOOLEAN DEFAULT false;
