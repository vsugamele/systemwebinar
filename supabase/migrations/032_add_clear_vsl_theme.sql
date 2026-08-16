ALTER TABLE webi_webinars
DROP CONSTRAINT IF EXISTS webi_webinars_theme_check;

ALTER TABLE webi_webinars
ADD CONSTRAINT webi_webinars_theme_check
CHECK (theme IN ('dark', 'light', 'youtube', 'clear_vsl'));
