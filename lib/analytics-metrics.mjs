const ATTENDANCE_EVENTS = new Set([
  'joined',
  'play_started',
  'watch_second',
  'progress_50',
  'watch_milestone_30min',
])

export function shouldMarkLeadAttended(eventType) {
  return ATTENDANCE_EVENTS.has(eventType)
}

export function countUniqueSessions(rows) {
  return new Set((rows || []).map(row => row.session_id).filter(Boolean)).size
}

export function getWatchDeltaSeconds(event, fallbackSeconds = 10) {
  const raw = event?.metadata?.watch_delta_seconds
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, raw)
  }
  return fallbackSeconds
}

export function getAnalyticsTimestamp(nativeCurrentTime, elapsedSeconds) {
  if (typeof nativeCurrentTime === 'number' && Number.isFinite(nativeCurrentTime) && nativeCurrentTime > 0) {
    return Math.floor(nativeCurrentTime)
  }
  return Math.max(0, Math.floor(elapsedSeconds || 0))
}

export function shouldEmitWatchSample(currentSeconds, intervalSeconds, sentSeconds) {
  if (!Number.isFinite(currentSeconds) || currentSeconds <= 0) return false
  const current = Math.floor(currentSeconds)
  if (current % intervalSeconds !== 0) return false
  if (sentSeconds.has(current)) return false
  sentSeconds.add(current)
  return true
}

export function shouldEmitProgress50(currentSeconds, durationSeconds, alreadyFired) {
  if (alreadyFired) return false
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false
  return currentSeconds > durationSeconds * 0.5
}
