import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const { webinarId, projectId, name, email, phone, metadata } = await req.json()
    const supabase = await createClient()

    if (!webinarId || !projectId || !email || !name) {
      return NextResponse.json({ message: 'Campos obrigatórios faltando.' }, { status: 400 })
    }

    // Upsert lead (by email and webinar_id due to unique index)
    // Wait, the unique index is on (email, webinar_id). We can try to insert, and on conflict do nothing and select it, or just query first.
    let { data: lead, error: findError } = await supabase
      .from('webi_leads')
      .select('id')
      .eq('email', email)
      .eq('webinar_id', webinarId)
      .single()

    if (!lead) {
      const { data: newLead, error: insertError } = await supabase
        .from('webi_leads')
        .insert({
          webinar_id: webinarId,
          project_id: projectId,
          name,
          email,
          phone,
          metadata,
          attended: true // they are registering to enter right now
        })
        .select()
        .single()

      if (insertError) {
        return NextResponse.json({ message: 'Erro ao criar lead: ' + insertError.message }, { status: 500 })
      }
      lead = newLead
    } else {
      // update phone/name/metadata if needed
      await supabase
        .from('webi_leads')
        .update({ name, phone, metadata, attended: true })
        .eq('id', lead.id)
    }

    // Trigger WhatsApp Notification
    if (phone) {
      const { data: webData } = await supabase
        .from('webi_webinars')
        .select('whatsapp_api_url, whatsapp_api_key, whatsapp_welcome_message')
        .eq('id', webinarId)
        .single()

      if (webData?.whatsapp_api_url && webData?.whatsapp_welcome_message) {
        const text = webData.whatsapp_welcome_message.replace(/\[NOME\]/gi, name)
        fetch(webData.whatsapp_api_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webData.whatsapp_api_key ? { apikey: webData.whatsapp_api_key, Authorization: `Bearer ${webData.whatsapp_api_key}` } : {})
          },
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ''),
            number: phone.replace(/\D/g, ''), // Fallback for Evolution API
            message: text,
            textMessage: { text }             // Fallback for Evolution API
          })
        }).catch(e => console.error('Erro ao enviar whatsapp_welcome:', e))
      }
    }

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set(`webi_lead_id_${webinarId}`, lead!.id, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    return NextResponse.json({ leadId: lead!.id })
  } catch (err: unknown) {
    return NextResponse.json({ message: 'Erro interno.' }, { status: 500 })
  }
}
