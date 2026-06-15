import test from 'node:test'
import assert from 'node:assert/strict'

import {
  shouldMarkLeadAttended,
  countUniqueSessions,
  getWatchDeltaSeconds,
  getAnalyticsTimestamp,
  shouldEmitWatchSample,
  shouldEmitProgress50,
} from './analytics-metrics.mjs'

test('marks attendance only for meaningful room/video engagement', () => {
  assert.equal(shouldMarkLeadAttended('page_view'), false)
  assert.equal(shouldMarkLeadAttended('trigger_in_webinar_email'), false)
  assert.equal(shouldMarkLeadAttended('joined'), true)
  assert.equal(shouldMarkLeadAttended('play_started'), true)
  assert.equal(shouldMarkLeadAttended('watch_second'), true)
})

test('counts unique sessions instead of event rows', () => {
  assert.equal(countUniqueSessions([{ session_id: 'a' }, { session_id: 'a' }, { session_id: 'b' }]), 2)
})

test('uses explicit watch delta and falls back for legacy rows', () => {
  assert.equal(getWatchDeltaSeconds({ metadata: { watch_delta_seconds: 30 } }), 30)
  assert.equal(getWatchDeltaSeconds({ metadata: { watch_delta_seconds: -1 } }), 0)
  assert.equal(getWatchDeltaSeconds({ metadata: {} }), 10)
})

test('uses elapsed webinar time when native video time is unavailable', () => {
  assert.equal(getAnalyticsTimestamp(undefined, 123), 123)
  assert.equal(getAnalyticsTimestamp(45, 123), 45)
})

test('emits watch samples once per interval-aligned timestamp', () => {
  const sent = new Set()
  assert.equal(shouldEmitWatchSample(30, 30, sent), true)
  assert.equal(shouldEmitWatchSample(30, 30, sent), false)
  assert.equal(shouldEmitWatchSample(31, 30, sent), false)
})

test('emits 50 percent progress once when duration is known', () => {
  assert.equal(shouldEmitProgress50(49, 100, false), false)
  assert.equal(shouldEmitProgress50(51, 100, false), true)
  assert.equal(shouldEmitProgress50(75, 100, true), false)
  assert.equal(shouldEmitProgress50(75, 0, false), false)
})
