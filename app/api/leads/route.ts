import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use anon client — leads public insert + webinars public read are allowed by RLS
// No service role key required
function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, email, name, phone, ...extraFields } = body
    const supabase = getAnonClient()

    // Get webinar + project data (allowed by webi_webinars_public_read RLS)
    const { data: webinar, error: webinarError } = await supabase
      .from('webi_webinars')
      .select('*, webi_projects(name, resend_from_email, accent_color, webhook_url)')
      .eq('id', webinar_id)
      .single()

    if (!webinar || webinarError) {
      return NextResponse.json({ error: 'Webinar not found' }, { status: 404 })
    }

    // Create lead (public insert allowed by RLS, upsert ignores duplicates)
    const metadata = Object.keys(extraFields).length > 0 ? extraFields : undefined
    const { data: lead, error: leadError } = await supabase
      .from('webi_leads')
      .upsert(
        { webinar_id, project_id: webinar.project_id, email, name, phone, ...(metadata ? { metadata } : {}) },
        { onConflict: 'email,webinar_id' }
      )
      .select()
      .single()

    if (leadError) {
      console.error('Lead upsert error:', leadError)
      return NextResponse.json({ error: leadError.message }, { status: 500 })
    }

    // Fire webhook if configured (fire-and-forget)
    const webhookUrl = webinar.webi_projects?.webhook_url
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'lead_registered',
          name,
          email,
          phone: phone || null,
          webinar_id,
          webinar_name: webinar.name,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}) // swallow errors — does not block lead registration
    }

    // Send email via Resend if configured and API key is real
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && !resendKey.includes('your_') && !resendKey.includes('re_your')) {
      try {
        const { resend } = await import('@/lib/resend')

        const { data: templates } = await supabase
          .from('webi_email_templates')
          .select('*')
          .eq('webinar_id', webinar_id)
          .eq('enabled', true)

        if (templates && templates.length > 0) {
          const fromEmail =
            webinar.webi_projects?.resend_from_email ||
            process.env.RESEND_FROM_EMAIL ||
            'webinar@yourdomain.com'
          const webinarUrl = `${process.env.NEXT_PUBLIC_APP_URL}/w/${webinar.slug}`

          for (const tpl of templates) {
            if (tpl.delay_minutes < 0) continue

            const htmlBody = tpl.body
              .replace(/{{name}}/g, name)
              .replace(/{{email}}/g, email)
              .replace(/{{webinar_url}}/g, `<a href="${webinarUrl}">${webinarUrl}</a>`)
              .replace(/{{webinar_name}}/g, webinar.name)
              .replace(/\n/g, '<br>')

            const subject = tpl.subject
              .replace(/{{name}}/g, name)
              .replace(/{{webinar_name}}/g, webinar.name)

            try {
              if (tpl.delay_minutes === 0) {
                await resend.emails.send({
                  from: fromEmail,
                  to: email,
                  subject,
                  html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">${htmlBody}</div>`,
                })
              } else if (tpl.delay_minutes <= 72 * 60) {
                const scheduledDate = new Date(Date.now() + tpl.delay_minutes * 60 * 1000)
                await resend.emails.send({
                  from: fromEmail,
                  to: email,
                  subject,
                  html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">${htmlBody}</div>`,
                  scheduledAt: scheduledDate.toISOString(),
                })
              }
            } catch (emailError) {
              console.warn(`Email sending failed for template ${tpl.type}:`, emailError)
            }
          }
        }
      } catch (resendInitError) {
        console.warn('Resend not initialized (check RESEND_API_KEY):', resendInitError)
      }
    }

    return NextResponse.json({ ok: true, lead_id: lead?.id })
  } catch (error) {
    console.error('Leads API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
