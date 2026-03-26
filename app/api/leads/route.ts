import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resend } from '@/lib/resend'

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

    // Fetch active email templates for this webinar
    const { data: templates } = await supabase
      .from('webi_email_templates')
      .select('*')
      .eq('webinar_id', webinar_id)
      .eq('enabled', true)
    
    if (templates && templates.length > 0) {
      const fromEmail = webinar.projects?.resend_from_email || process.env.RESEND_FROM_EMAIL || 'webinar@yourdomain.com'
      const webinarUrl = `${process.env.NEXT_PUBLIC_APP_URL}/w/${webinar.slug}`

      for (const tpl of templates) {
        // Build generic HTML email
        const htmlBody = tpl.body
          .replace(/{{name}}/g, name)
          .replace(/{{email}}/g, email)
          .replace(/{{webinar_url}}/g, `<a href="${webinarUrl}">${webinarUrl}</a>`)
          .replace(/{{webinar_name}}/g, webinar.name)
          .replace(/\n/g, '<br>')

        let subject = tpl.subject
          .replace(/{{name}}/g, name)
          .replace(/{{webinar_name}}/g, webinar.name)

        const isInstant = tpl.delay_minutes === 0

        // In evergreen immediate access, negative delays (e.g., "15min before") mean the start is NOW.
        // So we skip negative delays for immediate registrants. Positive delays are scheduled.
        if (tpl.delay_minutes < 0) continue;

        try {
          if (isInstant) {
            await resend.emails.send({
              from: fromEmail,
              to: email,
              subject,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">${htmlBody}</div>`,
            })
          } else {
            // Schedule via Resend (max 72h ahead)
            const scheduledDate = new Date(Date.now() + tpl.delay_minutes * 60 * 1000)
            
            // Limit to max 72h max according to resend scheduling limits (72h)
            if (tpl.delay_minutes <= 72 * 60) {
              await resend.emails.send({
                from: fromEmail,
                to: email,
                subject,
                html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">${htmlBody}</div>`,
                scheduledAt: scheduledDate.toISOString(),
              })
            }
          }
        } catch (emailError) {
          console.warn(`Email sending failed for type ${tpl.type}:`, emailError)
        }
      }
    }

    return NextResponse.json({ ok: true, lead_id: lead?.id })
  } catch (error) {
    console.error('Leads API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
