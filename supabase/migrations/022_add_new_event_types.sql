-- Drop the existing event type check constraint
ALTER TABLE webi_session_events DROP CONSTRAINT IF EXISTS webi_session_events_event_type_check;

-- Add the updated constraint including new event types
ALTER TABLE webi_session_events ADD CONSTRAINT webi_session_events_event_type_check
CHECK (event_type IN (
  'joined', 'watch_second', 'cta_clicked', 'cta_dismissed',
  'popup_seen', 'popup_dismissed', 'left', 'chat_sent',
  'progress_50', 'watch_milestone_30min', 'page_view', 'play_started'
));
