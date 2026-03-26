import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

export type EmailType = 'confirmation' | 'reminder_24h' | 'reminder_1h' | 'followup'

export interface SendEmailParams {
  to: string
  name: string
  webinarTitle: string
  webinarDate?: string
  webinarUrl?: string
  type: EmailType
  fromEmail?: string
}

export async function sendWebinarEmail(params: SendEmailParams) {
  const { to, name, webinarTitle, webinarDate, webinarUrl, type, fromEmail } = params
  const from = fromEmail || process.env.RESEND_FROM_EMAIL!

  const subjects: Record<EmailType, string> = {
    confirmation: `✅ Inscrição confirmada: ${webinarTitle}`,
    reminder_24h: `⏰ Seu webinar começa amanhã: ${webinarTitle}`,
    reminder_1h: `🔴 AO VIVO em 1 hora: ${webinarTitle}`,
    followup: `📹 Replay disponível: ${webinarTitle}`,
  }

  const bodies: Record<EmailType, string> = {
    confirmation: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#6366f1">Inscrição confirmada! 🎉</h1>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua inscrição no webinar <strong>${webinarTitle}</strong> foi confirmada.</p>
        ${webinarDate ? `<p>📅 Data: <strong>${webinarDate}</strong></p>` : ''}
        ${webinarUrl ? `<p><a href="${webinarUrl}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">Acessar o Webinar</a></p>` : ''}
        <p style="color:#888;font-size:14px;margin-top:32px">Até lá!</p>
      </div>
    `,
    reminder_24h: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#6366f1">Seu webinar é amanhã! ⏰</h1>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Lembrete: o webinar <strong>${webinarTitle}</strong> começa amanhã.</p>
        ${webinarDate ? `<p>📅 Data: <strong>${webinarDate}</strong></p>` : ''}
        ${webinarUrl ? `<p><a href="${webinarUrl}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">Acessar o Webinar</a></p>` : ''}
      </div>
    `,
    reminder_1h: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#ef4444">🔴 Começa em 1 hora!</h1>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>O webinar <strong>${webinarTitle}</strong> começa em 1 hora. Não perca!</p>
        ${webinarUrl ? `<p><a href="${webinarUrl}" style="background:#ef4444;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">Entrar Agora</a></p>` : ''}
      </div>
    `,
    followup: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#6366f1">📹 Replay disponível</h1>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>O replay do webinar <strong>${webinarTitle}</strong> está disponível por tempo limitado.</p>
        ${webinarUrl ? `<p><a href="${webinarUrl}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">Assistir Replay</a></p>` : ''}
      </div>
    `,
  }

  return resend.emails.send({
    from,
    to,
    subject: subjects[type],
    html: bodies[type],
  })
}
