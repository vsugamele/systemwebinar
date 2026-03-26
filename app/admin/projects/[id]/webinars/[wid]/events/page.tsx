'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { WebinarEvent, EventType } from '@/types'

const EVENT_TYPES = [
  { type: 'chat_message', label: 'Mensagem no Chat', icon: '💬', chipClass: 'chip-chat' },
  { type: 'offer_popup', label: 'Pop-up de Oferta', icon: '🎯', chipClass: 'chip-popup' },
  { type: 'pitch_button', label: 'Botão de Pitch', icon: '🛒', chipClass: 'chip-pitch' },
  { type: 'hide_pitch_button', label: 'Ocultar Pitch', icon: '🙈', chipClass: 'chip-pitch' },
  { type: 'email_auto', label: 'E-mail Automático', icon: '📧', chipClass: 'chip-email' },
]

const emptyPayloads: Record<EventType, object> = {
  chat_message: { author: '', avatar: '', text: '' },
  offer_popup: { title: '', subtitle: '', image_url: '', cta_text: 'Quero Agora', cta_url: '', duration_seconds: 30 },
  pitch_button: {
    image_url: '', text_above: '', cta_text: 'Garantir Minha Vaga', cta_url: '',
    exit_at_seconds: undefined,
    countdown_seconds: 0,
    scarcity_spots: 0,
    broadcast_sales: false,
    broadcast_names: '',
  },
  hide_pitch_button: {},
  email_auto: { template: 'followup', delay_minutes: 10 },
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function parseTime(str: string): number {
  const parts = str.split(':')
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1])
  return Number(str)
}

export default function EventsPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const [events, setEvents] = useState<WebinarEvent[]>([])
  const [webinarName, setWebinarName] = useState('')
  const [duration, setDuration] = useState(3600)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEvent, setEditEvent] = useState<WebinarEvent | null>(null)
  const [form, setForm] = useState<{ type: EventType; timestamp_seconds: number; timestampStr: string; payload: Record<string, any> }>({
    type: 'chat_message', timestamp_seconds: 0, timestampStr: '00:00', payload: { ...emptyPayloads.chat_message }
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function load() {
    const { data: webinar } = await supabase.from('webi_webinars').select('name, duration_seconds').eq('id', webinarId).single()
    setWebinarName(webinar?.name || '')
    setDuration(webinar?.duration_seconds || 3600)
    const { data } = await supabase.from('webi_events').select('*').eq('webinar_id', webinarId).order('timestamp_seconds')
    setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [webinarId])

  function openCreate(type: EventType = 'chat_message') {
    setEditEvent(null)
    setForm({ type, timestamp_seconds: 0, timestampStr: '00:00', payload: { ...emptyPayloads[type] as Record<string, any> } })
    setShowModal(true)
  }

  function openEdit(event: WebinarEvent) {
    setEditEvent(event)
    setForm({
      type: event.type,
      timestamp_seconds: event.timestamp_seconds,
      timestampStr: formatTime(event.timestamp_seconds),
      payload: { ...(event.payload as Record<string, any>) },
    })
    setShowModal(true)
  }

  async function save() {
    setSaving(true)
    const data = { webinar_id: webinarId, type: form.type, timestamp_seconds: form.timestamp_seconds, payload: form.payload }

    if (editEvent) {
      await supabase.from('webi_events').update(data).eq('id', editEvent.id)
    } else {
      await supabase.from('webi_events').insert(data)
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function deleteEvent(id: string) {
    await supabase.from('webi_events').delete().eq('id', id)
    load()
  }

  function updateTimestamp(str: string) {
    const secs = parseTime(str)
    setForm(f => ({ ...f, timestampStr: str, timestamp_seconds: isNaN(secs) ? 0 : secs }))
  }

  function updatePayload(key: string, value: any) {
    setForm(f => ({ ...f, payload: { ...f.payload, [key]: value } }))
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const timelineWidth = 1200
  const eventsGrouped = EVENT_TYPES.map(et => ({
    ...et,
    items: events.filter(e => e.type === et.type),
  }))

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href="/admin/projects" style={{ color: 'var(--brand-light)' }}>Projetos</Link> /{' '}
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> /{' '}
            {webinarName}
          </div>
          <h1 className="page-title">⚡ Agendador de Eventos</h1>
          <p className="page-subtitle">Configure os eventos que aparecem automaticamente durante o webinar</p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {EVENT_TYPES.slice(0, 3).map(et => (
            <button key={et.type} className={`btn btn-ghost btn-sm`} onClick={() => openCreate(et.type as EventType)}
              style={{ gap: 6 }}>
              {et.icon} {et.label}
            </button>
          ))}
          <button className="btn btn-primary" onClick={() => openCreate()}>+ Adicionar Evento</button>
        </div>
      </div>

      <div className="page-body">
        {/* LEGEND */}
        <div className="event-type-legend" style={{ marginBottom: 20 }}>
          {EVENT_TYPES.map(et => (
            <div key={et.type} className="legend-item">
              <div className={`legend-dot timeline-event-chip ${et.chipClass}`}
                style={{ width: 10, height: 10, borderRadius: '50%', padding: 0, border: 'none', display: 'block' }} />
              {et.icon} {et.label}
            </div>
          ))}
        </div>

        {/* VISUAL TIMELINE */}
        <div className="timeline-container" style={{ marginBottom: 24 }}>
          <div className="timeline-header">
            <span className="timeline-title">Timeline Visual</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Duração: {formatTime(duration)}</span>
          </div>
          <div className="timeline-track">
            {/* Ruler */}
            <div className="timeline-ruler" style={{ width: timelineWidth, marginBottom: 12 }}>
              {Array.from({ length: Math.ceil(duration / 60) + 1 }).map((_, i) => {
                const pct = (i * 60 / duration) * 100
                if (pct > 100) return null
                return (
                  <div key={i}>
                    <div className="timeline-ruler-tick" style={{ left: `${pct}%` }} />
                    <span className="timeline-ruler-label" style={{ left: `${pct}%` }}>{i}m</span>
                  </div>
                )
              })}
            </div>

            {/* Event rows per type */}
            {eventsGrouped.map(group => (
              <div key={group.type} style={{ position: 'relative', height: 40, marginBottom: 8, width: timelineWidth }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'var(--bg-elevated)', borderRadius: 6,
                }} />
                {group.items.map(ev => {
                  const pct = (ev.timestamp_seconds / duration) * 100
                  return (
                    <div
                      key={ev.id}
                      className={`timeline-event-chip ${group.chipClass}`}
                      style={{ left: `${Math.min(pct, 95)}%` }}
                      onClick={() => openEdit(ev)}
                      title={`${group.label} @ ${formatTime(ev.timestamp_seconds)}`}
                    >
                      {group.icon} {formatTime(ev.timestamp_seconds)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* EVENT LIST */}
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚡</div>
            <div className="empty-title">Nenhum evento configurado</div>
            <div className="empty-desc">Adicione eventos na timeline para criar a experiência do webinar</div>
            <button className="btn btn-primary" onClick={() => openCreate()}>Adicionar Primeiro Evento</button>
          </div>
        ) : (
          <div className="event-list">
            {events.map(ev => {
              const evType = EVENT_TYPES.find(t => t.type === ev.type)
              const payload = ev.payload as Record<string, any>
              return (
                <div key={ev.id} className="event-item">
                  <span className={`badge ${
                    ev.type === 'chat_message' ? 'badge-active' :
                    ev.type === 'offer_popup' ? '' :
                    'badge-draft'
                  }`} style={{ minWidth: 60, justifyContent: 'center' }}>
                    <code style={{ fontSize: 11, fontFamily: 'monospace' }}>{formatTime(ev.timestamp_seconds)}</code>
                  </span>
                  <span style={{ fontSize: 18 }}>{evType?.icon}</span>
                  <div className="event-info">
                    <div className="event-name">{evType?.label}</div>
                    <div className="event-desc">
                      {ev.type === 'chat_message' && `${payload.author}: "${payload.text}"`}
                      {ev.type === 'offer_popup' && `${payload.title} — ${payload.cta_text}`}
                      {ev.type === 'pitch_button' && `CTA: ${payload.cta_text}`}
                      {ev.type === 'email_auto' && `Template: ${payload.template} · Delay: ${payload.delay_minutes}min`}
                    </div>
                  </div>
                  <div className="event-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(ev)}>✏️ Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteEvent(ev.id)}>🗑</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* EVENT MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editEvent ? 'Editar Evento' : 'Novo Evento'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!editEvent && (
                <div className="form-group">
                  <label className="form-label">Tipo de Evento</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {EVENT_TYPES.map(et => (
                      <button key={et.type}
                        className={`btn ${form.type === et.type ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                        onClick={() => setForm(f => ({ ...f, type: et.type as EventType, payload: { ...(emptyPayloads[et.type as EventType] as Record<string, any>) } }))}
                        style={{ justifyContent: 'flex-start', gap: 8 }}>
                        {et.icon} {et.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Timestamp (mm:ss ou segundos)</label>
                <input className="form-input" placeholder="01:30 ou 90"
                  value={form.timestampStr}
                  onChange={e => updateTimestamp(e.target.value)} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  = {form.timestamp_seconds}s ({formatTime(form.timestamp_seconds)})
                </span>
              </div>

              {/* Dynamic payload fields */}
              {form.type === 'chat_message' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Nome do Autor (fictício)</label>
                    <input className="form-input" placeholder="Maria Silva"
                      value={form.payload.author || ''} onChange={e => updatePayload('author', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mensagem</label>
                    <textarea className="form-input form-textarea" placeholder="Isso é incrível! Nunca vi conteúdo assim..."
                      value={form.payload.text || ''} onChange={e => updatePayload('text', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Avatar URL (opcional)</label>
                    <input className="form-input" placeholder="https://..."
                      value={form.payload.avatar || ''} onChange={e => updatePayload('avatar', e.target.value)} />
                  </div>
                </>
              )}

              {form.type === 'offer_popup' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Título da Oferta</label>
                    <input className="form-input" placeholder="Oferta Especial — Só por Hoje!"
                      value={form.payload.title || ''} onChange={e => updatePayload('title', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Subtítulo</label>
                    <input className="form-input" placeholder="Garanta agora com desconto exclusivo"
                      value={form.payload.subtitle || ''} onChange={e => updatePayload('subtitle', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Imagem URL</label>
                    <input className="form-input" placeholder="https://..." value={form.payload.image_url || ''}
                      onChange={e => updatePayload('image_url', e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Texto do Botão</label>
                      <input className="form-input" value={form.payload.cta_text || ''}
                        onChange={e => updatePayload('cta_text', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Duração (segundos)</label>
                      <input type="number" className="form-input" value={form.payload.duration_seconds || 30}
                        onChange={e => updatePayload('duration_seconds', Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">URL de Destino</label>
                    <input className="form-input" placeholder="https://sua-pagina-de-vendas.com"
                      value={form.payload.cta_url || ''} onChange={e => updatePayload('cta_url', e.target.value)} />
                  </div>
                </>
              )}

              {form.type === 'pitch_button' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Imagem do Produto URL</label>
                    <input className="form-input" placeholder="https://..." value={form.payload.image_url || ''}
                      onChange={e => updatePayload('image_url', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Texto Acima do Botão</label>
                    <input className="form-input" placeholder="50% DE DESCONTO — AGARRE ESSA OPORTUNIDADE!"
                      value={form.payload.text_above || ''} onChange={e => updatePayload('text_above', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Texto do CTA (dentro do botão)</label>
                    <input className="form-input" placeholder="Quero garantir minha vaga agora!"
                      value={form.payload.cta_text || ''} onChange={e => updatePayload('cta_text', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">URL de Destino</label>
                    <input className="form-input" placeholder="https://..." value={form.payload.cta_url || ''}
                      onChange={e => updatePayload('cta_url', e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Ocultar no segundo</label>
                      <input type="number" className="form-input" placeholder="Ex: 3600"
                        value={form.payload.exit_at_seconds || ''}
                        onChange={e => updatePayload('exit_at_seconds', e.target.value ? Number(e.target.value) : undefined)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">⏱ Countdown (seg)</label>
                      <input type="number" className="form-input" placeholder="0 = desativado"
                        value={form.payload.countdown_seconds || 0}
                        onChange={e => updatePayload('countdown_seconds', Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">🪑 Vagas Restantes</label>
                      <input type="number" className="form-input" placeholder="0 = desativado"
                        value={form.payload.scarcity_spots || 0}
                        onChange={e => updatePayload('scarcity_spots', Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>📣 Broadcast de Vendas</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Simula mensagens de compra no chat após o pitch aparecer</div>
                      </div>
                      <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={!!form.payload.broadcast_sales}
                          onChange={e => updatePayload('broadcast_sales', e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
                        <span style={{ fontSize: 13 }}>{form.payload.broadcast_sales ? 'Ativado' : 'Desativado'}</span>
                      </label>
                    </div>
                    {form.payload.broadcast_sales && (
                      <div className="form-group">
                        <label className="form-label">Nomes para o Broadcast (separados por vírgula)</label>
                        <input className="form-input" placeholder="Maria, João, Ana, Carlos, Luciana..."
                          value={form.payload.broadcast_names || ''}
                          onChange={e => updatePayload('broadcast_names', e.target.value)} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Deixe vazio para usar o pool de nomes do webinar</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {form.type === 'email_auto' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Template</label>
                    <select className="form-input form-select" value={form.payload.template || 'followup'}
                      onChange={e => updatePayload('template', e.target.value)}>
                      <option value="followup">Follow-up / Replay</option>
                      <option value="reminder_24h">Lembrete 24h</option>
                      <option value="reminder_1h">Lembrete 1h</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Delay pós-webinar (minutos)</label>
                    <input type="number" className="form-input" value={form.payload.delay_minutes || 10}
                      onChange={e => updatePayload('delay_minutes', Number(e.target.value))} />
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : editEvent ? 'Salvar' : 'Adicionar Evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
