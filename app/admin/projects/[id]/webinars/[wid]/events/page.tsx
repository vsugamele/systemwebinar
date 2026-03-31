'use client'

import { useEffect, useRef, useState } from 'react'
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

// ---- Draggable chip for the visual timeline ----
interface DraggableChipProps {
  ev: WebinarEvent
  pct: number
  chipClass: string
  icon: string
  label: string
  duration: number
  onDrop: (newSecs: number) => Promise<void>
  onClick: () => void
}

function DraggableChip({ ev, pct, chipClass, icon, label, duration, onDrop, onClick }: DraggableChipProps) {
  const [dragging, setDragging] = useState(false)
  const [previewPct, setPreviewPct] = useState(pct)
  const [previewSecs, setPreviewSecs] = useState(ev.timestamp_seconds)
  const dragStartX = { x: 0, origPct: pct }
  const didMoveRef = { moved: false }

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    const chip = e.currentTarget as HTMLElement
    chip.setPointerCapture(e.pointerId)
    dragStartX.x = e.clientX
    dragStartX.origPct = previewPct
    didMoveRef.moved = false
    setDragging(false)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const parent = (e.currentTarget as HTMLElement).parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const dx = e.clientX - dragStartX.x
    if (Math.abs(dx) < 4 && !dragging) return
    didMoveRef.moved = true
    if (!dragging) setDragging(true)
    const newPct = Math.min(Math.max(dragStartX.origPct + (dx / rect.width) * 100, 0), 98)
    const newSecs = Math.round((newPct / 100) * duration)
    setPreviewPct(newPct)
    setPreviewSecs(newSecs)
  }

  async function handlePointerUp(e: React.PointerEvent) {
    e.stopPropagation()
    if (!didMoveRef.moved) {
      setDragging(false)
      onClick()
      return
    }
    setDragging(false)
    await onDrop(previewSecs)
  }

  return (
    <div
      className={`timeline-event-chip ${chipClass}`}
      style={{
        left: `${previewPct}%`,
        cursor: dragging ? 'grabbing' : 'grab',
        opacity: dragging ? 0.85 : 1,
        transform: dragging ? 'scale(1.08) translateY(-2px)' : 'scale(1)',
        transition: dragging ? 'none' : 'all 0.15s',
        boxShadow: dragging ? '0 4px 20px rgba(0,0,0,0.4)' : undefined,
        zIndex: dragging ? 10 : 1,
        touchAction: 'none',
      }}
      title={`${label} @ ${formatTime(ev.timestamp_seconds)} — arraste para reposicionar`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {icon}
      <span style={{ fontSize: 10, marginLeft: 3, fontFamily: 'monospace', fontWeight: 700 }}>
        {formatTime(previewSecs)}
      </span>
      {dragging && (
        <div style={{
          position: 'absolute',
          bottom: '110%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 11,
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
          pointerEvents: 'none',
        }}>
          ⏱ {formatTime(previewSecs)}
        </div>
      )}
    </div>
  )
}


interface GeneratedChatEvent {
  timestamp_seconds: number
  author: string
  text: string
}

export default function EventsPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const [events, setEvents] = useState<WebinarEvent[]>([])
  const [webinarName, setWebinarName] = useState('')
  const [duration, setDuration] = useState(3600)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEvent, setEditEvent] = useState<WebinarEvent | null>(null)

  // AI generator state
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiScript, setAiScript] = useState('')
  const [aiCount, setAiCount] = useState(20)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiPreview, setAiPreview] = useState<GeneratedChatEvent[]>([])
  const [aiError, setAiError] = useState('')
  const [aiInserting, setAiInserting] = useState(false)
  const [form, setForm] = useState<{ type: EventType; timestamp_seconds: number; timestampStr: string; payload: Record<string, any> }>({
    type: 'chat_message', timestamp_seconds: 0, timestampStr: '00:00', payload: { ...emptyPayloads.chat_message }
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function uploadImage(file: File, field: 'image_url'): Promise<string | null> {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `webinar-events/${webinarId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('webinar-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: pub } = supabase.storage.from('webinar-images').getPublicUrl(path)
      return pub?.publicUrl || null
    } catch {
      return null
    } finally {
      setUploading(false)
    }
  }

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

  async function generateWithAI() {
    if (!aiScript.trim()) {
      setAiError('Cole o roteiro do webinar antes de gerar.')
      return
    }
    setAiError('')
    setAiGenerating(true)
    setAiPreview([])
    try {
      const res = await fetch('/api/generate-chat-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webinar_id: webinarId, script: aiScript, count: aiCount, duration_seconds: duration }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setAiError(json.error || 'Erro ao gerar mensagens.')
      } else {
        setAiPreview(json.events || [])
      }
    } catch {
      setAiError('Erro de conexão. Tente novamente.')
    } finally {
      setAiGenerating(false)
    }
  }

  async function insertGeneratedEvents() {
    if (aiPreview.length === 0) return
    setAiInserting(true)
    const rows = aiPreview.map(e => ({
      webinar_id: webinarId,
      type: 'chat_message' as const,
      timestamp_seconds: e.timestamp_seconds,
      payload: { author: e.author, text: e.text, avatar: '' },
    }))
    await supabase.from('webi_events').insert(rows)
    setAiInserting(false)
    setShowAiModal(false)
    setAiPreview([])
    setAiScript('')
    load()
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
          <button className="btn btn-secondary" onClick={() => { setShowAiModal(true); setAiPreview([]); setAiError('') }}
            style={{ gap: 6 }}>
            ✨ Gerar com AI
          </button>
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
          <div
            className="timeline-track"
            id="timeline-track-root"
            style={{ position: 'relative', userSelect: 'none' }}
          >
            {/* Ruler */}
            <div className="timeline-ruler" style={{ marginBottom: 12, position: 'relative', height: 24 }}>
              {Array.from({ length: Math.ceil(duration / 60) + 1 }).map((_, i) => {
                const pct = (i * 60 / duration) * 100
                if (pct > 100) return null
                return (
                  <div key={i} style={{ position: 'absolute', left: `${pct}%` }}>
                    <div className="timeline-ruler-tick" style={{ left: 0 }} />
                    <span className="timeline-ruler-label" style={{ left: 0 }}>{i}m</span>
                  </div>
                )
              })}
            </div>

            {/* Drop hint when empty */}
            {events.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '20px 0',
                color: 'var(--text-muted)', fontSize: 13,
                border: '2px dashed var(--border)', borderRadius: 10,
              }}>
                Adicione eventos e arraste-os para posicioná-los na timeline
              </div>
            )}

            {/* Draggable event rows per type */}
            {eventsGrouped.map(group => (
              <div
                key={group.type}
                style={{
                  position: 'relative',
                  height: 44,
                  marginBottom: 8,
                  borderRadius: 8,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}
              >
                {/* Row label */}
                <span style={{
                  position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}>
                  {group.icon}
                </span>

                {group.items.map(ev => {
                  const pct = Math.min((ev.timestamp_seconds / duration) * 100, 98)
                  return (
                    <DraggableChip
                      key={ev.id}
                      ev={ev}
                      pct={pct}
                      chipClass={group.chipClass}
                      icon={group.icon}
                      label={group.label}
                      duration={duration}
                      onDrop={async (newSecs) => {
                        await supabase.from('webi_events').update({ timestamp_seconds: newSecs }).eq('id', ev.id)
                        load()
                      }}
                      onClick={() => openEdit(ev)}
                    />
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

      {/* AI GENERATOR MODAL */}
      {showAiModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAiModal(false)}>
          <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2 className="modal-title">✨ Gerar Mensagens de Chat com AI</h2>
              <button className="modal-close" onClick={() => setShowAiModal(false)}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '0 0 4px' }}>
              {aiPreview.length === 0 ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Cole o roteiro do seu webinar abaixo. A IA vai gerar mensagens de chat realistas que combinam com cada momento da apresentação.
                  </div>

                  <div className="form-group">
                    <label className="form-label">Roteiro do Webinar</label>
                    <textarea
                      className="form-input form-textarea"
                      style={{ minHeight: 220, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                      placeholder={`Exemplo de roteiro:\n\n00:00 - Boas-vindas e apresentação pessoal\n05:00 - Por que 95% das pessoas falham em X\n15:00 - Os 3 pilares do método\n25:00 - Demonstração prática ao vivo\n40:00 - Revelação do produto/oferta\n50:00 - Bônus e garantia\n55:00 - Perguntas e respostas`}
                      value={aiScript}
                      onChange={e => setAiScript(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Quantidade de mensagens — <strong style={{ color: 'var(--brand-light)' }}>{aiCount}</strong>
                    </label>
                    <input
                      type="range" min={5} max={60} step={5}
                      value={aiCount}
                      onChange={e => setAiCount(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--brand)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      <span>5 — bem espaçado</span>
                      <span>30 — moderado</span>
                      <span>60 — chat bem ativo</span>
                    </div>
                  </div>

                  {aiError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>
                      {aiError}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{aiPreview.length} mensagens</strong> geradas — revise e confirme para inserir na timeline.
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAiPreview([])}>
                      ← Voltar e editar
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                    {aiPreview.map((ev, i) => (
                      <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '52px 110px 1fr',
                        gap: 10, alignItems: 'start',
                        background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 12px',
                        border: '1px solid var(--border)',
                      }}>
                        <code style={{ fontSize: 11, color: 'var(--brand-light)', fontFamily: 'monospace', paddingTop: 2 }}>
                          {formatTime(ev.timestamp_seconds)}
                        </code>
                        <input
                          className="form-input"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          value={ev.author}
                          onChange={e => setAiPreview(prev => prev.map((x, j) => j === i ? { ...x, author: e.target.value } : x))}
                        />
                        <input
                          className="form-input"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          value={ev.text}
                          onChange={e => setAiPreview(prev => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Você pode editar qualquer texto ou nome acima antes de inserir. Depois de inserir, cada mensagem pode ser reposicionada na timeline ou editada individualmente.
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAiModal(false)}>Cancelar</button>
              {aiPreview.length === 0 ? (
                <button className="btn btn-primary" onClick={generateWithAI} disabled={aiGenerating || !aiScript.trim()}>
                  {aiGenerating ? <><span className="spinner" /> Gerando...</> : '✨ Gerar Mensagens'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={insertGeneratedEvents} disabled={aiInserting}>
                  {aiInserting ? <><span className="spinner" /> Inserindo...</> : `Inserir ${aiPreview.length} mensagens na timeline`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                    <label className="form-label">Imagem do Produto</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="form-input" placeholder="https://... ou faça upload abaixo" value={form.payload.image_url || ''}
                        onChange={e => updatePayload('image_url', e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <span className="spinner" /> : '📁 Upload'}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const url = await uploadImage(file, 'image_url')
                          if (url) updatePayload('image_url', url)
                          e.target.value = ''
                        }}
                      />
                    </div>
                    {form.payload.image_url && (
                      <img src={form.payload.image_url} alt="preview" style={{ marginTop: 8, height: 80, borderRadius: 8, objectFit: 'contain', border: '1px solid var(--border)' }} />
                    )}
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
