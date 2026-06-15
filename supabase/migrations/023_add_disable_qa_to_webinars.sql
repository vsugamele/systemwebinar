-- Add disable_qa column to webi_webinars table
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS disable_qa BOOLEAN DEFAULT false;
