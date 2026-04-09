/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import type { WebinarEvent, EventType } from '@/types'

const EVENT_TYPES = [
  { type: 'chat_message', label: 'Mensagem no Chat', icon: '💬', chipClass: 'chip-chat' },
  { type: 'offer_popup', label: 'Pop-up de Oferta', icon: '🎯', chipClass: 'chip-popup' },
  { type: 'pitch_button', label: 'Botão de Pitch', icon: '🛒', chipClass: 'chip-pitch' },
  { type: 'hide_pitch_button', label: 'Ocultar Pitch', icon: '🙈', chipClass: 'chip-pitch' },
  { type: 'email_auto', label: 'E-mail Automático', icon: '📧', chipClass: 'chip-email' },
]

const emptyPayloads: Record<EventType, object> = {
  chat_message: { author: '', avatar: '', text: '', image_url: '', link_url: '', link_text: '' },
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
  const dragStartRef = useRef({ x: 0, origPct: pct })
  const didMoveRef = useRef({ moved: false })

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    const chip = e.currentTarget as HTMLElement
    chip.setPointerCapture(e.pointerId)
    dragStartRef.current.x = e.clientX
    dragStartRef.current.origPct = previewPct
    didMoveRef.current.moved = false
    setDragging(false)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const parent = (e.currentTarget as HTMLElement).parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const dx = e.clientX - dragStartRef.current.x
    if (Math.abs(dx) < 4 && !dragging) return
    didMoveRef.current.moved = true
    if (!dragging) setDragging(true)
    const newPct = Math.min(Math.max(dragStartRef.current.origPct + (dx / rect.width) * 100, 0), 98)
    const newSecs = Math.round((newPct / 100) * duration)
    setPreviewPct(newPct)
    setPreviewSecs(newSecs)
  }

  async function handlePointerUp(e: React.PointerEvent) {
    e.stopPropagation()
    if (!didMoveRef.current.moved) {
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
      {(() => {
        const preview = (ev.payload as Record<string, string>)?.text?.slice(0, 18)
        return preview ? (
          <span style={{
            fontSize: 9, marginLeft: 4, opacity: 0.65, maxWidth: 80,
            overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block',
            verticalAlign: 'middle',
          }}>
            {preview}…
          </span>
        ) : null
      })()}
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
  const [aiScript, setAiScript] = useState('')
  const [aiCount, setAiCount] = useState(20)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiPreview, setAiPreview] = useState<GeneratedChatEvent[]>([])
  const [aiError, setAiError] = useState('')
  const [aiInserting, setAiInserting] = useState(false)

  // Chat panel tabs: quick | bulk | ai
  const [chatTab, setChatTab] = useState<'quick' | 'bulk' | 'ai'>('quick')
  const [bulkText, setBulkText] = useState('')
  const [bulkParsed, setBulkParsed] = useState<GeneratedChatEvent[]>([])
  const [bulkInserting, setBulkInserting] = useState(false)

  // Quick-add chat state
  const [qMM, setQMM] = useState('0')
  const [qSS, setQSS] = useState('0')
  const [qAuthor, setQAuthor] = useState('')
  const [qText, setQText] = useState('')
  const [qSaving, setQSaving] = useState(false)
  const [form, setForm] = useState<{ type: EventType; timestamp_seconds: number; timestampStr: string; payload: Record<string, any> }>({
    type: 'chat_message', timestamp_seconds: 0, timestampStr: '00:00', payload: { ...emptyPayloads.chat_message }
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function uploadImage(file: File, _field: 'image_url'): Promise<string | null> {
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

  function openCreate(type: EventType = 'chat_message', initialSeconds = 0) {
    const secs = Math.max(0, Math.min(initialSeconds, duration))
    const mm = String(Math.floor(secs / 60)).padStart(2, '0')
    const ss = String(secs % 60).padStart(2, '0')
    setEditEvent(null)
    setForm({ type, timestamp_seconds: secs, timestampStr: `${mm}:${ss}`, payload: { ...emptyPayloads[type] as Record<string, any> } })
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
    try {
      const data = { webinar_id: webinarId, type: form.type, timestamp_seconds: form.timestamp_seconds, payload: form.payload }

      if (editEvent) {
        await supabase.from('webi_events').update(data).eq('id', editEvent.id)
        toast.success('Evento atualizado com sucesso!')
      } else {
        await supabase.from('webi_events').insert(data)
        toast.success('Novo evento adicionado!')
      }

      setShowModal(false)
      load()
    } catch {
      toast.error('Ocorreu um erro ao salvar o evento.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir?')) return
    await supabase.from('webi_events').delete().eq('id', id)
    toast.success('Evento removido.')
    load()
  }



  function updatePayload(key: string, value: unknown) {
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
    try {
      const rows = aiPreview.map(e => ({
        webinar_id: webinarId,
        type: 'chat_message' as const,
        timestamp_seconds: e.timestamp_seconds,
        payload: { author: e.author, text: e.text, avatar: '' },
      }))
      await supabase.from('webi_events').insert(rows)
      toast.success(`${rows.length} mensagens inseridas na timeline!`)
      setAiPreview([])
      setAiScript('')
      load()
    } catch {
      toast.error('Erro ao inserir eventos na timeline.')
    } finally {
      setAiInserting(false)
    }
  }

  async function addQuickChat() {
    if (!qAuthor.trim() || !qText.trim()) return
    setQSaving(true)
    try {
      const secs = Math.max(0, Number(qMM) * 60 + Number(qSS))
      await supabase.from('webi_events').insert({
        webinar_id: webinarId,
        type: 'chat_message',
        timestamp_seconds: secs,
        payload: { author: qAuthor.trim(), text: qText.trim(), avatar: '' },
      })
      toast.success('Mensagem de chat adicionada!')
      setQAuthor('')
      setQText('')
      load()
    } catch {
      toast.error('Erro ao adicionar mensagem rápida.')
    } finally {
      setQSaving(false)
    }
  }

  function parseBulkText(text: string): GeneratedChatEvent[] {
    if (!text.trim()) return []
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed: GeneratedChatEvent[] = []
    for (const line of lines) {
      // Formats accepted:
      // 01:30 Maria: Nossa, incrível!
      // 1:30 Maria Silva: Texto da mensagem
      // 90 Maria: Mensagem (raw seconds)
      const match = line.match(/^(\d{1,3}:\d{2})\s+(.+?):\s+(.+)$/)
      if (match) {
        const [, timeStr, author, text] = match
        const [mm, ss] = timeStr.split(':').map(Number)
        parsed.push({ timestamp_seconds: mm * 60 + ss, author: author.trim(), text: text.trim() })
        continue
      }
      // Raw seconds format: 90 Maria: Mensagem
      const match2 = line.match(/^(\d+)\s+(.+?):\s+(.+)$/)
      if (match2) {
        const [, secs, author, text] = match2
        parsed.push({ timestamp_seconds: Number(secs), author: author.trim(), text: text.trim() })
        continue
      }
    }
    return parsed.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
  }

  async function insertBulkMessages() {
    if (bulkParsed.length === 0) return
    setBulkInserting(true)
    try {
      const rows = bulkParsed.map(e => ({
        webinar_id: webinarId,
        type: 'chat_message' as const,
        timestamp_seconds: e.timestamp_seconds,
        payload: { author: e.author, text: e.text, avatar: '' },
      }))
      await supabase.from('webi_events').insert(rows)
      toast.success(`${rows.length} mensagens importadas na timeline!`)
      setBulkText('')
      setBulkParsed([])
      load()
    } catch {
      toast.error('Erro ao importar mensagens.')
    } finally {
      setBulkInserting(false)
    }
  }

  async function deleteAllChatMessages() {
    const chatIds = chatEvents.map(e => e.id)
    if (chatIds.length === 0) return
    if (!window.confirm(`Tem certeza que deseja excluir TODAS as ${chatIds.length} mensagens de chat?`)) return
    try {
      await supabase.from('webi_events').delete().in('id', chatIds)
      toast.success(`${chatIds.length} mensagens excluídas.`)
      load()
    } catch {
      toast.error('Erro ao excluir mensagens.')
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const chatEvents = events.filter(e => e.type === 'chat_message').sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
  const pitchEvents = events.filter(e => e.type === 'pitch_button' || e.type === 'hide_pitch_button')
  const popupEvents = events.filter(e => e.type === 'offer_popup')
  const otherEvents = events.filter(e => e.type === 'email_auto')

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
          <button className="btn btn-primary" onClick={() => openCreate()}>+ Evento</button>
        </div>
      </div>

      <div className="page-body">
        {/* LEGEND */}
        <div className="event-type-legend" style={{ marginBottom: 20 }}>
          {EVENT_TYPES.map(et => (
            <div key={et.type} className="legend-item" style={{ cursor: 'pointer' }} onClick={() => openCreate(et.type as EventType)}>
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
            <div className="timeline-ruler" style={{ marginBottom: 12 }}>
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
                title={`Clique para adicionar ${group.label}`}
                style={{
                  position: 'relative',
                  height: 44,
                  marginBottom: 8,
                  borderRadius: 8,
                  background: group.items.length > 0 ? 'var(--bg-elevated)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${group.items.length > 0 ? 'var(--border)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.timeline-event-chip')) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const secs = Math.round(((e.clientX - rect.left) / rect.width) * duration)
                  openCreate(group.type as EventType, secs)
                }}
              >
                {/* Row label: icon + text + badge */}
                <div style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 12 }}>{group.icon}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {group.label}
                  </span>
                  {group.items.length > 0 && (
                    <span style={{
                      fontSize: 9, background: 'var(--brand)', color: '#fff',
                      borderRadius: 100, padding: '1px 5px', fontWeight: 700,
                    }}>
                      {group.items.length}
                    </span>
                  )}
                </div>

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

        {/* 2-ZONE LAYOUT */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

          {/* LEFT — Chat Messages */}
          <div>
            <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
              {/* Header with tabs */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                  💬 Mensagens no Chat
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                    {chatEvents.length} {chatEvents.length === 1 ? 'mensagem' : 'mensagens'}
                  </span>
                </div>
                {chatEvents.length > 0 && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--danger)', padding: '3px 10px' }}
                    onClick={deleteAllChatMessages}>🗑 Limpar todas</button>
                )}
              </div>

              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--bg-elevated)', borderRadius: 10, padding: 3 }}>
                {[
                  { key: 'quick' as const, label: '➕ Ponto a Ponto', desc: 'Adicionar mensagem específica na timeline' },
                  { key: 'ai' as const, label: '✨ LIA (Gerador IA)', desc: 'Gerar mensagens automáticas a partir do roteiro' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setChatTab(tab.key); setAiError('') }}
                    title={tab.desc}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontSize: 12, fontWeight: chatTab === tab.key ? 700 : 500,
                      background: chatTab === tab.key ? 'var(--brand)' : 'transparent',
                      color: chatTab === tab.key ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TAB: Quick-add */}
              {chatTab === 'quick' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 38 }}>
                    <input type="number" min={0} max={999} value={qMM} onChange={e => setQMM(e.target.value)}
                      style={{ width: 40, background: 'transparent', border: 'none', outline: 'none', textAlign: 'center', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 700 }} />
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1 }}>:</span>
                    <input type="number" min={0} max={59} value={qSS}
                      onChange={e => setQSS(String(Math.min(59, Number(e.target.value))).padStart(2, '0'))}
                      style={{ width: 34, background: 'transparent', border: 'none', outline: 'none', textAlign: 'center', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 700 }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>min:s</span>
                  </div>
                  <input className="form-input" placeholder="Nome" style={{ width: 140, flexShrink: 0 }}
                    value={qAuthor} onChange={e => setQAuthor(e.target.value)} />
                  <input className="form-input" placeholder="Texto da mensagem... (Enter para salvar)"
                    style={{ flex: 1, minWidth: 180 }} value={qText}
                    onChange={e => setQText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void addQuickChat()} />
                  <button className="btn btn-primary" style={{ flexShrink: 0 }}
                    onClick={() => void addQuickChat()} disabled={qSaving || !qAuthor.trim() || !qText.trim()}>
                    {qSaving ? <span className="spinner" /> : '+ Add'}
                  </button>
                </div>
              )}

              {/* TAB: AI Generation */}
              {chatTab === 'ai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🧠 LIA - Preparar Chat Automaticamente</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                      Cole o <b>Roteiro ou Transcrição</b> do seu vídeo. A LIA (Inteligência Artificial) usará o motor configurado na aba "Chat & IA" do Webinar (através do OpenRouter) para analisar o conteúdo e gerar mensagens autênticas distribuídas em toda a duração do vídeo.
                    </div>
                    {aiError && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{aiError}</div>}
                    
                    <textarea 
                      className="form-input form-textarea" 
                      placeholder="Ex: [00:00] Olá pessoal, bem vindos à Masterclass de hoje. Meu nome é... [02:30] O primeiro grande erro que vejo é... [15:00] E por isso o método X funciona." 
                      value={aiScript} 
                      onChange={e => setAiScript(e.target.value)} 
                      style={{ minHeight: 120, marginBottom: 12, fontSize: 13 }}
                    />
                    
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ margin: 0, width: 150 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Qtd. de Mensagens</label>
                        <input type="number" className="form-input" min={1} max={200} value={aiCount} onChange={e => setAiCount(Number(e.target.value))} />
                      </div>
                      
                      <button className="btn btn-primary" onClick={generateWithAI} disabled={aiGenerating || !aiScript.trim()} style={{ flex: 1, minWidth: 200, padding: '10px 16px' }}>
                        {aiGenerating ? <span className="spinner" /> : '✨ Analisar Com IA e Gerar Chat'}
                      </button>
                    </div>
                  </div>

                  {aiPreview.length > 0 && (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                          ✅ {aiPreview.length} mensagens geradas!
                        </div>
                        <button className="btn btn-success btn-sm" onClick={insertGeneratedEvents} disabled={aiInserting} style={{ padding: '6px 12px', fontSize: 12 }}>
                          {aiInserting ? <span className="spinner" /> : '📥 Inserir todas na timeline'}
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 6 }}>
                        {aiPreview.map((ev, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                            <code style={{ color: 'var(--brand-light)' }}>{formatTime(ev.timestamp_seconds)}</code>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{ev.author}:</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{ev.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat list */}
            {chatEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                Nenhuma mensagem pontual criada ainda — use a caixa acima. Configurações massivas agora ficam em <Link href={`/admin/projects/${projectId}/webinars/${webinarId}/chat`} style={{ color: 'var(--brand)' }}>💬 Chat & IA</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {chatEvents.map(ev => {
                  const p = ev.payload as Record<string, unknown>
                  const initial = String(p.author || '?')[0]?.toUpperCase()
                  return (
                    <div key={ev.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'var(--bg-card)', borderRadius: 10, padding: '9px 12px',
                      border: '1px solid var(--border)',
                    }}>
                      <code style={{ fontSize: 11, color: 'var(--brand-light)', fontFamily: 'monospace', minWidth: 38, flexShrink: 0 }}>
                        {formatTime(ev.timestamp_seconds)}
                      </code>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>{initial}</div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-light)', flexShrink: 0 }}>
                        {String(p.author)}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(p.text)}
                      </span>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 12, flexShrink: 0 }} onClick={() => openEdit(ev)}>✏️</button>
                      <button className="btn btn-danger btn-sm" style={{ padding: '3px 8px', fontSize: 12, flexShrink: 0 }} onClick={() => deleteEvent(ev.id)}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT — Pitch + Popups + Other */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* PITCH */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>🛒 Pitch Button</span>
                <button className="btn btn-ghost btn-sm" onClick={() => openCreate('pitch_button')}>+ Novo</button>
              </div>
              {pitchEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  Nenhum pitch configurado
                </div>
              ) : (
                pitchEvents.map(ev => {
                  const p = ev.payload as Record<string, unknown>
                  const isHide = ev.type === 'hide_pitch_button'
                  return (
                    <div key={ev.id} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 12, border: `1px solid ${isHide ? 'var(--border)' : 'rgba(99,102,241,0.25)'}`, marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isHide ? 0 : 6 }}>
                        <code style={{ fontSize: 11, color: isHide ? 'var(--text-muted)' : 'var(--brand-light)', fontFamily: 'monospace' }}>
                          {isHide ? '🙈 ocultar' : '▶ aparecer'} {formatTime(ev.timestamp_seconds)}
                        </code>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!isHide && <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => openEdit(ev)}>✏️</button>}
                          <button className="btn btn-danger btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => deleteEvent(ev.id)}>✕</button>
                        </div>
                      </div>
                      {!isHide && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{String(p.cta_text || '—')}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 4 }}>{String(p.cta_url || '—')}</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {!!p.countdown_seconds && <span style={{ fontSize: 11, color: 'var(--warning)' }}>⏱ {String(p.countdown_seconds)}s</span>}
                            {!!p.scarcity_spots && <span style={{ fontSize: 11, color: 'var(--warning)' }}>🪑 {String(p.scarcity_spots)} vagas</span>}
                            {!!p.broadcast_sales && <span style={{ fontSize: 11, color: 'var(--success)' }}>📣 broadcast</span>}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })
              )}
              {pitchEvents.some(e => e.type === 'pitch_button') && !pitchEvents.some(e => e.type === 'hide_pitch_button') && (
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 4, fontSize: 12 }} onClick={() => openCreate('hide_pitch_button')}>
                  + Ocultar pitch no segundo…
                </button>
              )}
            </div>

            {/* POPUPS */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>🎯 Pop-ups</span>
                <button className="btn btn-ghost btn-sm" onClick={() => openCreate('offer_popup')}>+ Novo</button>
              </div>
              {popupEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>Nenhum pop-up configurado</div>
              ) : (
                popupEvents.map(ev => {
                  const p = ev.payload as Record<string, unknown>
                  return (
                    <div key={ev.id} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 12, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <code style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{formatTime(ev.timestamp_seconds)}</code>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => openEdit(ev)}>✏️</button>
                          <button className="btn btn-danger btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => deleteEvent(ev.id)}>✕</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{String(p.title || '—')}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{String(p.cta_text || '')} · {String(p.duration_seconds || 30)}s</div>
                    </div>
                  )
                })
              )}
            </div>

            {/* OTHER (email_auto) */}
            {otherEvents.length > 0 && (
              <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>📋 Outros</div>
                {otherEvents.map(ev => {
                  const evType = EVENT_TYPES.find(t => t.type === ev.type)
                  return (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <code style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{formatTime(ev.timestamp_seconds)}</code>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{evType?.icon} {evType?.label}</span>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => openEdit(ev)}>✏️</button>
                      <button className="btn btn-danger btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => deleteEvent(ev.id)}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
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
                <label className="form-label">Tempo no Vídeo (Minutos : Segundos)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={0} max={999} className="form-input" 
                    placeholder="Min"
                    value={Math.floor(form.timestamp_seconds / 60)} 
                    onChange={e => setForm(f => ({ ...f, timestamp_seconds: (Math.max(0, Number(e.target.value)) * 60) + (f.timestamp_seconds % 60) }))} 
                    style={{ width: 80, textAlign: 'center', fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold' }} 
                  />
                  <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-muted)' }}>:</span>
                  <input type="number" min={0} max={59} className="form-input" 
                    placeholder="Seg"
                    value={String(form.timestamp_seconds % 60).padStart(2, '0')} 
                    onChange={e => setForm(f => ({ ...f, timestamp_seconds: Math.floor(f.timestamp_seconds / 60) * 60 + Math.min(59, Math.max(0, Number(e.target.value))) }))} 
                    style={{ width: 80, textAlign: 'center', fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold' }} 
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                    ({form.timestamp_seconds} segundos de vídeo)
                  </span>
                </div>
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
                  <div className="form-group">
                    <label className="form-label">Imagem do produto (opcional)</label>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Aparece na bolha do chat acima do botão
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="form-input" placeholder="https://..."
                        value={form.payload.image_url || ''} onChange={e => updatePayload('image_url', e.target.value)}
                        style={{ flex: 1 }} />
                      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        📎 Upload
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={async e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const url = await uploadImage(file, 'image_url')
                            if (url) updatePayload('image_url', url)
                          }} />
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">URL do botão (opcional)</label>
                      <input className="form-input" placeholder="https://checkout...."
                        value={form.payload.link_url || ''} onChange={e => updatePayload('link_url', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Texto do botão</label>
                      <input className="form-input" placeholder="Ver agora →"
                        value={form.payload.link_text || ''} onChange={e => updatePayload('link_text', e.target.value)} />
                    </div>
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
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="form-input" placeholder="https://... ou faça upload" value={form.payload.image_url || ''}
                        onChange={e => updatePayload('image_url', e.target.value)} style={{ flex: 1 }} />
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
