'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface SessionEvent {
  id: string
  session_id: string
  event_type: string
  timestamp_video: number | null
  created_at: string
  webi_leads?: { email: string, name: string } | null
}

const eventIcons: Record<string, string> = {
  joined: '🟢', left: '🔴', cta_clicked: '💰', cta_dismissed: '❌',
  popup_seen: '👀', popup_dismissed: '❌', chat_sent: '💬', watch_second: '⏱'
}
const eventLabels: Record<string, string> = {
  joined: 'Entrou na sala', left: 'Saiu da sala', cta_clicked: 'Clicou na Oferta', cta_dismissed: 'Fechou Oferta',
  popup_seen: 'Viu Pop-up', popup_dismissed: 'Fechou Pop-up', chat_sent: 'Enviou Mensagem', watch_second: 'Assistindo (ping)'
}

export default function LogsPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string, wid: string }>()
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [webinarName, setWebinarName] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: webinar } = await supabase.from('webi_webinars').select('name').eq('id', webinarId).single()
      if (webinar) setWebinarName(webinar.name)

      // Fetch latest 1000 events excluding 'watch_second' heartbeat ping for clarity
      const { data: evts } = await supabase.from('webi_session_events')
        .select(`
          id, session_id, event_type, timestamp_video, created_at,
          webi_leads ( email, name )
        `)
        .eq('webinar_id', webinarId)
        .neq('event_type', 'watch_second')
        .order('created_at', { ascending: false })
        .limit(1000)

      setEvents((evts ?? []) as unknown as SessionEvent[])
      setLoading(false)
    }
    load()
  }, [webinarId])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">Relatório de LOGs</h1>
          <p className="page-subtitle">Histórico em tempo real das ações dos participantes ativos nesta sala</p>
        </div>
      </div>

      <div className="page-body">
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <div className="empty-title">Nenhum evento registrado</div>
            <div className="empty-desc">Assim que alguém entrar na sala, os eventos começarão a aparecer aqui.</div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Participante</th>
                  <th>Evento</th>
                  <th>Momento no Vídeo</th>
                  <th>Sessão</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {new Date(ev.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td>
                      {ev.webi_leads ? (
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{ev.webi_leads.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ev.webi_leads.email}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Anônimo</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-draft" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        {eventIcons[ev.event_type] || '📌'} {eventLabels[ev.event_type] || ev.event_type}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {ev.timestamp_video !== null ? `${Math.floor(ev.timestamp_video / 60)}:${String(Math.floor(ev.timestamp_video % 60)).padStart(2, '0')}` : '—'}
                    </td>
                    <td>
                      <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.session_id.split('-')[0]}...</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
