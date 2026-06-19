import { createClient } from '@supabase/supabase-js'

export async function fireAndLogWebhook({
  webinarId,
  eventType,
  webhookUrl,
  payload,
}: {
  webinarId: string
  eventType: string
  webhookUrl: string
  payload: any
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(url, key)

  let responseStatus = 0
  let responseBody = ''

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    
    responseStatus = res.status
    responseBody = await res.text()
  } catch (err: any) {
    responseStatus = 500
    responseBody = err.message || String(err)
  }

  try {
    const { error } = await supabase.from('webi_webhook_logs').insert({
      webinar_id: webinarId,
      event_type: eventType,
      webhook_url: webhookUrl,
      payload,
      response_status: responseStatus,
      response_body: responseBody.slice(0, 1000), // Limit size to 1000 characters
    })
    if (error) {
      console.error('Supabase log insert error:', error)
    }
  } catch (logErr) {
    console.error('Failed to log webhook event:', logErr)
  }
}
