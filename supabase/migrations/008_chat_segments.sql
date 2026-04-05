-- 008: CPM segments per video timestamp
-- Array of { from, to, cpm, phrases } objects
-- to: null = until end | phrases: 'elogios'|'vaga'|'engajamento'|'todas'|null
ALTER TABLE webi_webinars ADD COLUMN IF NOT EXISTS chat_segments JSONB;
