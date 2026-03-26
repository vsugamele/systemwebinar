import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendWebinarEmail } from '@/lib/resend'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, email, name, phone } = body
    const supabase = await createServiceClient()

    // Get webinar + project data
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('*, webi_projects(name, resend_from_email)')
      .eq('id', webinar_id)
      .single()

    if (!webinar) return NextResponse.json({ error: 'Webinar not found' }, { status: 404 })

    // Create lead (ignore conflict = duplicate registration)
    const { data: lead, error } = await supabase
      .from('webi_leads')
      .upsert({ webinar_id, project_id: webinar.project_id, email, name, phone },
        { onConflict: 'email,webinar_id' })
      .select()
      .single()

    // Send confirmation email
    try {
      await sendWebinarEmail({
        to: email,
        name,
        webinarTitle: webinar.name,
        webinarUrl: `${process.env.NEXT_PUBLIC_APP_URL}/w/${webinar.slug}`,
        type: 'confirmation',
        fromEmail: webinar.projects?.resend_from_email || undefined,
      })
    } catch (emailError) {
      console.warn('Email sending failed:', emailError)
    }

    return NextResponse.json({ ok: true, lead_id: lead?.id })
  } catch (error) {
    console.error('Leads API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
