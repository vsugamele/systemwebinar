-- Migration 010: Recurring schedule support
ALTER TABLE webi_webinars
  ADD COLUMN IF NOT EXISTS schedule_recurrence TEXT NOT NULL DEFAULT 'once'
    CHECK (schedule_recurrence IN ('once', 'daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS schedule_time TEXT,       -- 'HH:mm' e.g. '20:00'
  ADD COLUMN IF NOT EXISTS schedule_days INTEGER[];  -- weekly: [1,3,5] (0=Sun..6=Sat)
