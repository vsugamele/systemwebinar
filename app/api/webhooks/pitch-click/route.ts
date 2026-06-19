import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { fireAndLogWebhook } from '@/lib/webhook-logger'

export async function POST(req: Request) {
  try {
    const { webinarId, sessionId } = await req.json()
    const supabase = await createClient()

    if (!webinarId) {
      return NextResponse.json({ message: 'Webinar ID missing' }, { status: 400 })
    }

    // Capture cookie
    const cookieStore = await cookies()
    const leadId = cookieStore.get(`webi_lead_id_${webinarId}`)?.value

    // Record the session event
    await supabase.from('webi_session_events').insert({
      webinar_id: webinarId,
      session_id: sessionId || 'unknown',
      lead_id: leadId || null,
      event_type: 'cta_clicked'
    })

    // Fetch the webinar webhook/whatsapp config
    const { data: w } = await supabase.from('webi_webinars')
      .select('webhook_url, project_id, whatsapp_api_url, whatsapp_api_key, whatsapp_pitch_message')
      .eq('id', webinarId)
      .single()

    const webhookUrl = w?.webhook_url

    let payload: any = { event: 'pitch_clicked', session_id: sessionId }
    let leadData: any = null

    // If we know the lead, fetch their data to send in the webhook and whatsapp
    if (leadId) {
      const { data: l } = await supabase.from('webi_leads').select('*').eq('id', leadId).single()
      if (l) {
        leadData = l
        payload.lead = {
          name: l.name,
          email: l.email,
          phone: l.phone,
          registered_at: l.registered_at
        }
      }
    }

    // Trigger webhook asynchronously (fire and forget log)
    if (webhookUrl) {
      fireAndLogWebhook({
        webinarId,
        eventType: 'pitch_clicked',
        webhookUrl,
        payload
      })
    }

    // Trigger WhatsApp Pitch Notification
    if (leadData?.phone && w?.whatsapp_api_url && w?.whatsapp_pitch_message) {
      const text = w.whatsapp_pitch_message.replace(/\[NOME\]/gi, leadData.name || '')
      const purePhone = leadData.phone.replace(/\D/g, '')
      fetch(w.whatsapp_api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(w.whatsapp_api_key ? { apikey: w.whatsapp_api_key, Authorization: `Bearer ${w.whatsapp_api_key}` } : {})
        },
        body: JSON.stringify({
          phone: purePhone,
          number: purePhone, // Fallback for Evolution API
          message: text,
          textMessage: { text } // Fallback for Evolution API
        })
      }).catch(e => console.error('Erro ao enviar whatsapp_pitch:', e))
    }

    return NextResponse.json({ success: true, tracked: true })
  } catch (err: any) {
    return NextResponse.json({ message: 'Internal error' }, { status: 500 })
  }
}
