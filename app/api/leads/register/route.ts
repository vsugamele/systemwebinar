import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const { webinarId, projectId, name, email, phone, metadata, runId, run_id } = await req.json()

    if (!webinarId || !projectId || !email || !name) {
      return NextResponse.json({ message: 'Campos obrigatórios faltando.' }, { status: 400 })
    }

    // Use anon client — the register_lead RPC is SECURITY DEFINER so it
    // bypasses RLS even for unauthenticated public visitors.
    // This is the same pattern used in /api/leads/route.ts.
    const supabase = await createClient()

    const { data: lead, error: leadError } = await supabase.rpc('register_lead', {
      p_webinar_id: webinarId,
      p_project_id: projectId,
      p_email: email,
      p_name: name,
      p_phone: phone || null,
      p_metadata: metadata || null,
      p_run_id: runId || run_id || null,
    })

    if (leadError) {
      console.error('Lead register RPC error:', leadError)
      return NextResponse.json({ message: 'Erro ao criar lead: ' + leadError.message }, { status: 500 })
    }

    const leadId = lead?.id ?? lead

    // Trigger WhatsApp welcome message (fire-and-forget)
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
            ...(webData.whatsapp_api_key
              ? { apikey: webData.whatsapp_api_key, Authorization: `Bearer ${webData.whatsapp_api_key}` }
              : {}),
          },
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ''),
            number: phone.replace(/\D/g, ''),
            message: text,
            textMessage: { text },
          }),
        }).catch(e => console.error('Erro ao enviar whatsapp_welcome:', e))
      }
    }

    // Set the lead cookie so the visitor can enter the webinar room directly
    const cookieStore = await cookies()
    cookieStore.set(`webi_lead_id_${webinarId}`, String(leadId), {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return NextResponse.json({ leadId })
  } catch (err: unknown) {
    console.error('Lead register error:', err)
    return NextResponse.json({ message: 'Erro interno.' }, { status: 500 })
  }
}
