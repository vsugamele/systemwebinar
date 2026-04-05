-- Quiz questions per webinar
CREATE TABLE IF NOT EXISTS webi_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES webi_webinars(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_index INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quiz responses from participants
CREATE TABLE IF NOT EXISTS webi_quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES webi_webinars(id) ON DELETE CASCADE,
  lead_email TEXT NOT NULL,
  lead_name TEXT,
  answers JSONB NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,   -- percentage 0-100
  total INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_webinar ON webi_quiz_questions(webinar_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_webinar ON webi_quiz_responses(webinar_id, completed_at DESC);

ALTER TABLE webi_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webi_quiz_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webi_quiz_questions' AND policyname = 'Service role full access quiz_questions'
  ) THEN
    CREATE POLICY "Service role full access quiz_questions"
      ON webi_quiz_questions FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webi_quiz_responses' AND policyname = 'Service role full access quiz_responses'
  ) THEN
    CREATE POLICY "Service role full access quiz_responses"
      ON webi_quiz_responses FOR ALL USING (true);
  END IF;
END $$;
