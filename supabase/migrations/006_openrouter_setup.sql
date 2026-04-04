-- Adicionar openrouter_api_key em webi_projects
ALTER TABLE webi_projects ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT;

-- Adicionar ai_model em webi_webinars
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'google/gemini-flash-1.5';
