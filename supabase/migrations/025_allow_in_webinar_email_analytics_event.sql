-- Allow in-webinar email trigger events emitted by the webinar room.
ALTER TABLE webi_session_events DROP CONSTRAINT IF EXISTS webi_session_events_event_type_check;

ALTER TABLE webi_session_events ADD CONSTRAINT webi_session_events_event_type_check
CHECK (event_type IN (
  'joined', 'watch_second', 'cta_clicked', 'cta_dismissed',
  'popup_seen', 'popup_dismissed', 'left', 'chat_sent',
  'progress_50', 'watch_milestone_30min', 'page_view', 'play_started',
  'trigger_in_webinar_email'
));
