const ATTENDANCE_EVENTS = new Set([
  'joined',
  'play_started',
  'watch_second',
  'progress_25',
  'progress_50',
  'progress_75',
  'progress_90',
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

export function shouldEmitProgressMilestone(currentSeconds, durationSeconds, milestonePct, firedMilestones) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false
  if (!Number.isFinite(currentSeconds) || currentSeconds < 0) return false
  if (!Number.isFinite(milestonePct) || milestonePct <= 0 || milestonePct > 100) return false
  if (firedMilestones.has(milestonePct)) return false
  if (currentSeconds <= durationSeconds * (milestonePct / 100)) return false
  firedMilestones.add(milestonePct)
  return true
}

export function getAudienceAtMinute(viewersByMinute, minute, peakViewers) {
  if (!Number.isFinite(minute) || minute < 0) {
    return { audience: 0, retention_pct: 0 }
  }
  const point = (viewersByMinute || []).find(v => v.minute === minute)
  const audience = point?.viewers || 0
  const retentionBase = Number.isFinite(peakViewers) && peakViewers > 0 ? peakViewers : 1
  return {
    audience,
    retention_pct: Math.round((audience / retentionBase) * 100),
  }
}

export function getAverageEngagementPct(sessions, durationSeconds) {
  if (!Array.isArray(sessions) || sessions.length === 0) return 0
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const totalPct = sessions.reduce((sum, session) => {
    const watchTime = Math.max(0, Number(session.watch_time) || 0)
    return sum + Math.min(100, (watchTime / durationSeconds) * 100)
  }, 0)
  return Math.round(totalPct / sessions.length)
}
