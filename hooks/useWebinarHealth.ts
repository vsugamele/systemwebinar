'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type HealthStatus = 'ok' | 'warn' | 'empty'

export interface WebinarHealth {
  overview: HealthStatus      // has video_url + name
  registration: HealthStatus  // has landing_headline
  events: HealthStatus        // count of non-chat events (pitch, popup…)
  chat: HealthStatus          // has chat_segments or chat_cpm
  materials: HealthStatus     // count of materials
  quiz: HealthStatus          // count of quiz_question events
  leads: HealthStatus         // count of leads
  analytics: HealthStatus     // always 'ok' (view only)
  loading: boolean
  leadsCount: number
  eventsCount: number
  materialsCount: number
}

const DEFAULT: WebinarHealth = {
  overview: 'empty',
  registration: 'empty',
  events: 'empty',
  chat: 'empty',
  materials: 'empty',
  quiz: 'empty',
  leads: 'empty',
  analytics: 'ok',
  loading: true,
  leadsCount: 0,
  eventsCount: 0,
  materialsCount: 0,
}

export function useWebinarHealth(webinarId: string): WebinarHealth {
  const [health, setHealth] = useState<WebinarHealth>(DEFAULT)
  const supabase = createClient()

  useEffect(() => {
    if (!webinarId) return

    let cancelled = false

    async function load() {
      const [webinarRes, eventsRes, materialsRes, leadsRes, quizRes] = await Promise.all([
        // Webinar settings
        supabase
          .from('webi_webinars')
          .select('name, video_url, chat_segments, chat_cpm, landing_headline')
          .eq('id', webinarId)
          .single(),
        // Non-chat events (pitch, popup, etc.)
        supabase
          .from('webi_events')
          .select('id', { count: 'exact', head: true })
          .eq('webinar_id', webinarId)
          .neq('event_type', 'chat_message'),
        // Materials
        supabase
          .from('webi_materials')
          .select('id', { count: 'exact', head: true })
          .eq('webinar_id', webinarId),
        // Leads
        supabase
          .from('webi_leads')
          .select('id', { count: 'exact', head: true })
          .eq('webinar_id', webinarId),
        // Quiz questions (as events)
        supabase
          .from('webi_events')
          .select('id', { count: 'exact', head: true })
          .eq('webinar_id', webinarId)
          .eq('event_type', 'quiz_question'),
      ])

      if (cancelled) return

      const w = webinarRes.data
      const eventsCount = eventsRes.count ?? 0
      const materialsCount = materialsRes.count ?? 0
      const leadsCount = leadsRes.count ?? 0
      const quizCount = quizRes.count ?? 0

      // ── Compute statuses ──────────────────────────────────────────────────
      const overview: HealthStatus =
        w?.video_url && w?.name ? 'ok' : w?.name ? 'warn' : 'empty'

      const registration: HealthStatus =
        w?.landing_headline ? 'ok' : 'warn'

      const events: HealthStatus =
        eventsCount >= 3 ? 'ok' : eventsCount > 0 ? 'warn' : 'empty'

      const hasSegments =
        Array.isArray(w?.chat_segments) && (w?.chat_segments as unknown[]).length > 0
      const hasCpm = w?.chat_cpm && (w.chat_cpm as number) > 0
      const chat: HealthStatus = hasSegments || hasCpm ? 'ok' : 'warn'

      const materials: HealthStatus =
        materialsCount > 0 ? 'ok' : 'empty'

      const quiz: HealthStatus = quizCount > 0 ? 'ok' : 'empty'

      const leads: HealthStatus =
        leadsCount > 10 ? 'ok' : leadsCount > 0 ? 'warn' : 'empty'

      setHealth({
        overview,
        registration,
        events,
        chat,
        materials,
        quiz,
        leads,
        analytics: 'ok',
        loading: false,
        leadsCount,
        eventsCount,
        materialsCount,
      })
    }

    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webinarId])

  return health
}
