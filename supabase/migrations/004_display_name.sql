-- Add display_name column for a public-facing name in the webinar room header
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS display_name text;
