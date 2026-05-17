-- =============================================
-- 020: INDEX FOR REALTIME ANALYTICS QUERIES
-- =============================================

-- Speed up "online now" query:
-- SELECT DISTINCT session_id FROM webi_session_events
-- WHERE webinar_id = ? AND event_type = 'watch_second' AND created_at > now() - interval '90 seconds'
CREATE INDEX IF NOT EXISTS session_events_realtime_idx
  ON webi_session_events (webinar_id, event_type, created_at DESC);
