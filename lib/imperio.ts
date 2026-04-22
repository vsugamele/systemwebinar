/**
 * Imperio HQ webhook integration helper.
 * Fires event data to the Imperio CRM for lead enrichment.
 */

const IMPERIO_ENDPOINT = 'https://tkbivipqiewkfnhktmqq.supabase.co/functions/v1/membros-webhook'

export interface ImperioPayload {
  project_id: string
  event_type: string
  email?: string
  nome?: string
  phone?: string
  origem?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  respostas?: unknown
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  page_url?: string
}

/**
 * Fire-and-forget: dispatches an event to the Imperio HQ webhook.
 * Errors are swallowed to never block main flows.
 */
export function imperioSend(payload: ImperioPayload): void {
  if (!payload.project_id) return // skip if not configured

  fetch(IMPERIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((e) => console.warn('[Imperio HQ]', e))
}
