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
  { type: 'poll', label: 'Enquete', icon: '📊', chipClass: 'chip-poll' },
  { type: 'quiz_question', label: 'Quiz no Chat', icon: '📝', chipClass: 'chip-quiz' },
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
  poll: { question: '', options: ['Sim', 'Não'] },
  quiz_question: { question_id: '' },
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

// Extended type for roteiro import (can include non-chat events)
type ParsedEvent =
  | { kind: 'chat'; timestamp_seconds: number; author: string; text: string }
  | { kind: 'pitch'; timestamp_seconds: number; cta_text: string; cta_url: string; countdown_seconds: number }
  | { kind: 'popup'; timestamp_seconds: number; title: string; cta_url: string; duration_seconds: number }
  | { kind: 'hide_pitch'; timestamp_seconds: number }

// ---- QuickPitch: simplified pitch creator ----
function QuickPitchForm({ webinarId, duration, onCreated }: { webinarId: string; duration: number; onCreated: () => void }) {
  const supabase = createClient()
  const [url, setUrl] = useState('')
  const [ctaText, setCtaText] = useState('Garantir Minha Vaga 🔒')
  const [atSecs, setAtSecs] = useState(Math.round(duration * 0.6))
  const [countdown, setCountdown] = useState(0)
  const [scarcity, setScarcity] = useState(0)
  const [saving, setSaving] = useState(false)

  const mm = String(Math.floor(atSecs / 60)).padStart(2, '0')
  const ss = String(atSecs % 60).padStart(2, '0')

  async function handleSave() {
    if (!url.trim()) { toast.error('Cole a URL do checkout primeiro.'); return }
    setSaving(true)
    await supabase.from('webi_events').insert({
      webinar_id: webinarId,
      type: 'pitch_button',
      timestamp_seconds: atSecs,
      payload: {
        cta_text: ctaText.trim() || 'Garantir Minha Vaga',
        cta_url: url.trim(),
        image_url: '', text_above: '',
        countdown_seconds: countdown,
        scarcity_spots: scarcity,
        broadcast_sales: false,
        broadcast_names: '',
      },
    })
    toast.success(`✅ Pitch adicionado para ${mm}:${ss}!`)
    onCreated()
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* URL */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>🔗 URL do Checkout *</label>
        <input
          className="form-input"
          type="url"
          placeholder="https://pay.hotmart.com/..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          style={{ fontSize: 13 }}
        />
      </div>

      {/* CTA text */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>💬 Texto do Botão</label>
        <input
          className="form-input"
          placeholder="Garantir Minha Vaga 🔒"
          value={ctaText}
          onChange={e => setCtaText(e.target.value)}
          style={{ fontSize: 13 }}
        />
      </div>

      {/* Time slider */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>⏱ Aparecer no minuto</label>
          <code style={{ fontSize: 12, color: 'var(--brand-light)', fontWeight: 700 }}>{mm}:{ss}</code>
        </div>
        <input
          type="range" min={0} max={duration} step={30}
          value={atSecs}
          onChange={e => setAtSecs(+e.target.value)}
          style={{ width: '100%', accentColor: '#6366f1' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          <span>00:00</span><span>{String(Math.floor(duration / 60))}:00</span>
        </div>
      </div>

      {/* Optional: countdown + scarcity side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>🔥 Countdown (seg)</label>
          <input
            type="number" min={0} max={3600}
            className="form-input"
            value={countdown}
            onChange={e => setCountdown(+e.target.value)}
            style={{ fontSize: 13 }}
            placeholder="0 = sem contador"
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>🪑 Vagas Limitadas</label>
          <input
            type="number" min={0} max={9999}
            className="form-input"
            value={scarcity}
            onChange={e => setScarcity(+e.target.value)}
            style={{ fontSize: 13 }}
            placeholder="0 = ilimitado"
          />
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', marginTop: 4 }}
        onClick={handleSave}
        disabled={saving || !url.trim()}
      >
        {saving ? <span className="spinner" /> : '🛒 Criar Pitch Button'}
      </button>
    </div>
  )
}

export default function EventsPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const [events, setEvents] = useState<WebinarEvent[]>([])
  const [webinarName, setWebinarName] = useState('')
  const [duration, setDuration] = useState(3600)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEvent, setEditEvent] = useState<WebinarEvent | null>(null)
  const [quizQuestions, setQuizQuestions] = useState<{ id: string; question: string }[]>([])

  // AI generator state
  const [aiScript, setAiScript] = useState('')
  const [aiCount, setAiCount] = useState(20)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiPreview, setAiPreview] = useState<GeneratedChatEvent[]>([])
  const [aiError, setAiError] = useState('')
  const [aiInserting, setAiInserting] = useState(false)

  // Chat panel tabs: quick | paste | script | ai
  const [chatTab, setChatTab] = useState<'quick' | 'paste' | 'script' | 'ai'>('quick')

  // MODE: Direct paste (fake messages you write yourself)
  const [pasteText, setPasteText] = useState('')
  const [pasteParsed, setPasteParsed] = useState<GeneratedChatEvent[]>([])
  const [pasteInserting, setPasteInserting] = useState(false)

  // MODE: Script/Roteiro import (full roteiro with [PITCH]/[POPUP] markers)
  const [scriptText, setScriptText] = useState('')
  const [scriptParsed, setScriptParsed] = useState<ParsedEvent[]>([])
  const [scriptInserting, setScriptInserting] = useState(false)

  // legacy bulk (kept for compat)
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
    const { data: qs } = await supabase.from('webi_quiz_questions').select('id, question').eq('webinar_id', webinarId).order('sort_order')
    setQuizQuestions(qs || [])
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

  // ── PARSER: Direct Paste (fake messages only, no events)
  function parsePasteText(text: string): GeneratedChatEvent[] {
    if (!text.trim()) return []
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed: GeneratedChatEvent[] = []
    for (const line of lines) {
      // Skip comment lines and special markers
      if (line.startsWith('#') || line.startsWith('[')) continue
      // HH:MM:SS Nome: Texto
      let m = line.match(/^(\d{1,2}):(\d{2}):(\d{2})\s+(.+?):\s+(.+)$/)
      if (m) {
        parsed.push({ timestamp_seconds: +m[1]*3600 + +m[2]*60 + +m[3], author: m[4].trim(), text: m[5].trim() })
        continue
      }
      // MM:SS Nome: Texto
      m = line.match(/^(\d{1,3}):(\d{2})\s+(.+?):\s+(.+)$/)
      if (m) {
        parsed.push({ timestamp_seconds: +m[1]*60 + +m[2], author: m[3].trim(), text: m[4].trim() })
        continue
      }
      // Raw seconds: 90 Nome: Texto
      m = line.match(/^(\d+)\s+(.+?):\s+(.+)$/)
      if (m) {
        parsed.push({ timestamp_seconds: +m[1], author: m[2].trim(), text: m[3].trim() })
      }
    }
    return parsed.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
  }

  async function insertPasteMessages() {
    if (pasteParsed.length === 0) return
    setPasteInserting(true)
    try {
      await supabase.from('webi_events').insert(
        pasteParsed.map(e => ({
          webinar_id: webinarId, type: 'chat_message' as const,
          timestamp_seconds: e.timestamp_seconds,
          payload: { author: e.author, text: e.text, avatar: '' },
        }))
      )
      toast.success(`${pasteParsed.length} mensagens adicionadas à timeline!`)
      setPasteText(''); setPasteParsed([]); load()
    } catch { toast.error('Erro ao inserir mensagens.') }
    finally { setPasteInserting(false) }
  }

  // ── PARSER: Roteiro Completo (chat + [PITCH] + [POPUP] + [OCULTAR_PITCH])
  function parseScriptText(text: string): ParsedEvent[] {
    if (!text.trim()) return []
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed: ParsedEvent[] = []

    function parseTime(t: string): number {
      const parts = t.split(':').map(Number)
      if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2]
      if (parts.length === 2) return parts[0]*60 + parts[1]
      return parts[0] // raw seconds
    }

    for (const line of lines) {
      if (line.startsWith('#')) continue

      // HH:MM:SS or MM:SS prefix
      const timeMatch = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/) ||
                        line.match(/^(\d+)\s+(.+)$/) // raw secs
      if (!timeMatch) continue

      const secs = parseTime(timeMatch[1])
      const rest = timeMatch[2].trim()

      // [PITCH] Texto do botão | URL | countdown_secs (optional)
      const pitchM = rest.match(/^\[PITCH\]\s*(.+?)(?:\s*\|\s*(.+?))?(?:\s*\|\s*(\d+))?$/i)
      if (pitchM) {
        parsed.push({ kind: 'pitch', timestamp_seconds: secs,
          cta_text: pitchM[1]?.trim() || 'Garantir Minha Vaga',
          cta_url: pitchM[2]?.trim() || '',
          countdown_seconds: +(pitchM[3] || 0) })
        continue
      }

      // [POPUP] Título | URL | duração_secs (optional)
      const popupM = rest.match(/^\[POPUP\]\s*(.+?)(?:\s*\|\s*(.+?))?(?:\s*\|\s*(\d+))?$/i)
      if (popupM) {
        parsed.push({ kind: 'popup', timestamp_seconds: secs,
          title: popupM[1]?.trim() || 'Oferta Especial',
          cta_url: popupM[2]?.trim() || '',
          duration_seconds: +(popupM[3] || 30) })
        continue
      }

      // [OCULTAR_PITCH]
      if (/^\[OCULTAR_PITCH\]/i.test(rest)) {
        parsed.push({ kind: 'hide_pitch', timestamp_seconds: secs })
        continue
      }

      // Regular chat: Nome: Texto
      const chatM = rest.match(/^(.+?):\s+(.+)$/)
      if (chatM) {
        parsed.push({ kind: 'chat', timestamp_seconds: secs,
          author: chatM[1].trim(), text: chatM[2].trim() })
      }
    }
    return parsed.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
  }

  async function insertScriptEvents() {
    if (scriptParsed.length === 0) return
    setScriptInserting(true)
    try {
      const rows = scriptParsed.map(ev => {
        if (ev.kind === 'chat') return {
          webinar_id: webinarId, type: 'chat_message' as const,
          timestamp_seconds: ev.timestamp_seconds,
          payload: { author: ev.author, text: ev.text, avatar: '' },
        }
        if (ev.kind === 'pitch') return {
          webinar_id: webinarId, type: 'pitch_button' as const,
          timestamp_seconds: ev.timestamp_seconds,
          payload: { cta_text: ev.cta_text, cta_url: ev.cta_url, countdown_seconds: ev.countdown_seconds,
            scarcity_spots: 0, broadcast_sales: false, broadcast_names: '', image_url: '', text_above: '' },
        }
        if (ev.kind === 'popup') return {
          webinar_id: webinarId, type: 'offer_popup' as const,
          timestamp_seconds: ev.timestamp_seconds,
          payload: { title: ev.title, subtitle: '', image_url: '', cta_text: 'Quero Agora', cta_url: ev.cta_url, duration_seconds: ev.duration_seconds },
        }
        // hide_pitch
        return {
          webinar_id: webinarId, type: 'hide_pitch_button' as const,
          timestamp_seconds: ev.timestamp_seconds, payload: {},
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('webi_events').insert(rows as any[])
      const chats = scriptParsed.filter(e => e.kind === 'chat').length
      const others = scriptParsed.length - chats
      toast.success(`Importado! ${chats} msgs de chat + ${others} eventos de vendas.`)
      setScriptText(''); setScriptParsed([]); load()
    } catch { toast.error('Erro ao importar eventos.') }
    finally { setScriptInserting(false) }
  }

  function parseBulkText(text: string): GeneratedChatEvent[] {
    return parsePasteText(text)
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
          <h1 className="page-title">⚡ Orquestrador de Vendas (Eventos)</h1>
          <p className="page-subtitle">Programe os gatilhos exatos (Botões de Compra, Ofertas, Provas Sociais) no minuto estratégico do seu Roteiro.</p>
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

              {/* Tab switcher — 4 modes */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 14, background: 'var(--bg-elevated)', borderRadius: 10, padding: 3 }}>
                {([
                  { key: 'quick' as const, label: '➕ 1 por 1', desc: 'Adicionar mensagem pontual' },
                  { key: 'paste' as const, label: '📋 Colar Msgs', desc: 'Cole suas mensagens fake já prontas com timestamps' },
                  { key: 'script' as const, label: '📄 Roteiro Full', desc: 'Cole o roteiro completo com [PITCH], [POPUP] e chat' },
                  { key: 'ai' as const, label: '✨ LIA (IA)', desc: 'Gerar mensagens automáticas com IA' },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setChatTab(tab.key); setAiError('') }}
                    title={tab.desc}
                    style={{
                      flex: 1, padding: '7px 6px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontSize: 11, fontWeight: chatTab === tab.key ? 700 : 500,
                      background: chatTab === tab.key ? 'var(--brand)' : 'transparent',
                      color: chatTab === tab.key ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s', whiteSpace: 'nowrap',
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

              {/* TAB: Direct Paste — fake messages you write yourself */}
              {chatTab === 'paste' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>📋 Cole suas mensagens fake prontas.</strong>{' '}
                    Escreva cada linha no formato abaixo. Aceita MM:SS, HH:MM:SS ou segundos puros:
                    <div style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg)', borderRadius: 6, padding: '8px 10px', marginTop: 8, color: '#a5b4fc' }}>
                      05:30 Maria Silva: Adorei a explicação!<br/>
                      10:00 João Pedro: Método incrível, já estou aplicando<br/>
                      45:00 Ana Beatriz: Quando abre o carrinho??<br/>
                      1:02:30 Carlos: Melhor aula que já vi!<br/>
                      3720 Fernanda: Estou dentro! 🔥
                    </div>
                  </div>

                  <textarea
                    className="form-input form-textarea"
                    placeholder={`05:30 Maria: Adorei essa parte!\n10:00 João: Método incrível!\n45:00 Ana: Quando abre o carrinho??`}
                    value={pasteText}
                    onChange={e => {
                      setPasteText(e.target.value)
                      setPasteParsed(parsePasteText(e.target.value))
                    }}
                    style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 13 }}
                  />

                  {pasteParsed.length > 0 && (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                          ✅ {pasteParsed.length} mensagens reconhecidas
                        </span>
                        <button className="btn btn-primary btn-sm" onClick={insertPasteMessages} disabled={pasteInserting}>
                          {pasteInserting ? <span className="spinner" /> : `📥 Inserir ${pasteParsed.length} mensagens`}
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                        {pasteParsed.slice(0, 8).map((ev, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 6, padding: '4px 8px' }}>
                            <code style={{ color: 'var(--brand-light)', flexShrink: 0 }}>{formatTime(ev.timestamp_seconds)}</code>
                            <span style={{ fontWeight: 700, flexShrink: 0, color: 'var(--text-primary)' }}>{ev.author}:</span>
                            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.text}</span>
                          </div>
                        ))}
                        {pasteParsed.length > 8 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>…e mais {pasteParsed.length - 8} mensagens</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Roteiro Full — parses chat + [PITCH] + [POPUP] + [OCULTAR_PITCH] */}
              {chatTab === 'script' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>📄 Cole o roteiro COMPLETO com timestamps.</strong>{' '}
                    Cria mensagens de chat <strong>E</strong> eventos de vendas (pitch, pop-up) de uma só vez:
                    <div style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg)', borderRadius: 6, padding: '8px 10px', marginTop: 8, color: '#fcd34d' }}>
                      05:30 Maria: Adorei a explicação!<br/>
                      10:00 João: Isso é incrível!<br/>
                      45:00 [PITCH] Garantir Minha Vaga | https://checkout.com/P123 | 600<br/>
                      52:00 [POPUP] Última Chance! | https://checkout.com/P123 | 30<br/>
                      75:00 [OCULTAR_PITCH]<br/>
                      1:20:00 Ana: Tomei a decisão certa! ✅
                    </div>
                  </div>

                  <textarea
                    className="form-input form-textarea"
                    placeholder={`05:30 Maria: Adorei!\n45:00 [PITCH] Garantir Vaga | https://checkout.com | 600\n52:00 [POPUP] Última Chance! | https://checkout.com | 30\n75:00 [OCULTAR_PITCH]`}
                    value={scriptText}
                    onChange={e => {
                      setScriptText(e.target.value)
                      setScriptParsed(parseScriptText(e.target.value))
                    }}
                    style={{ minHeight: 180, fontFamily: 'monospace', fontSize: 13 }}
                  />

                  {scriptParsed.length > 0 && (() => {
                    const chatCount = scriptParsed.filter(e => e.kind === 'chat').length
                    const pitchCount = scriptParsed.filter(e => e.kind === 'pitch').length
                    const popupCount = scriptParsed.filter(e => e.kind === 'popup').length
                    const hideCount = scriptParsed.filter(e => e.kind === 'hide_pitch').length
                    return (
                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {chatCount > 0 && <span style={{ fontSize: 12, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '2px 8px', borderRadius: 6 }}>💬 {chatCount} msgs</span>}
                            {pitchCount > 0 && <span style={{ fontSize: 12, background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '2px 8px', borderRadius: 6 }}>🛒 {pitchCount} pitch</span>}
                            {popupCount > 0 && <span style={{ fontSize: 12, background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '2px 8px', borderRadius: 6 }}>🎯 {popupCount} pop-up</span>}
                            {hideCount > 0 && <span style={{ fontSize: 12, background: 'rgba(107,114,128,0.15)', color: '#9ca3af', padding: '2px 8px', borderRadius: 6 }}>🙈 {hideCount} ocultar</span>}
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={insertScriptEvents} disabled={scriptInserting}>
                            {scriptInserting ? <span className="spinner" /> : `📥 Importar ${scriptParsed.length} eventos`}
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                          {scriptParsed.slice(0, 10).map((ev, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 6, padding: '4px 8px' }}>
                              <code style={{ color: 'var(--brand-light)', flexShrink: 0 }}>{formatTime(ev.timestamp_seconds)}</code>
                              {ev.kind === 'chat' && <><span style={{ fontWeight: 700, flexShrink: 0 }}>{ev.author}:</span><span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.text}</span></>}
                              {ev.kind === 'pitch' && <span style={{ color: '#34d399' }}>🛒 PITCH — {ev.cta_text}</span>}
                              {ev.kind === 'popup' && <span style={{ color: '#f87171' }}>🎯 POPUP — {ev.title}</span>}
                              {ev.kind === 'hide_pitch' && <span style={{ color: '#9ca3af' }}>🙈 Ocultar Pitch</span>}
                            </div>
                          ))}
                          {scriptParsed.length > 10 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>…e mais {scriptParsed.length - 10} eventos</div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* TAB: AI Generation */}
              {chatTab === 'ai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🧠 LIA - Clonagem de Audiência (IA)</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                      Cole o <b>Roteiro ou Transcrição</b> do seu vídeo. A LIA analisará seu roteiro e criará uma audiência engajada de forma automatizada: pessoas concordando, se surpreendendo, e criando antecipação extrema para a venda. O motor de IA master deve estar configurado na aba &quot;Chat &amp; IA&quot;.
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

            {/* ⚡ QUICK-PITCH */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(168,85,247,0.06) 100%)',
              border: '1.5px solid rgba(99,102,241,0.3)',
              borderRadius: 16, padding: '16px',
            }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⚡ Criar Pitch em 1 Minuto</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                💡 Configure o botão de compra em segundos — sem precisar usar o formulário avançado.
              </div>

              <QuickPitchForm
                webinarId={webinarId}
                duration={duration}
                onCreated={load}
              />
            </div>

            {/* PITCH list */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>🛒 Pitch Button</span>
                <button className="btn btn-ghost btn-sm" onClick={() => openCreate('pitch_button')}>+ Avançado</button>
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

              {form.type === 'poll' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Pergunta da Enquete</label>
                    <input className="form-input" placeholder="Ex: Você já investe em ações?"
                      value={form.payload.question || ''} onChange={e => updatePayload('question', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Opções (uma por linha)</label>
                    <textarea className="form-input form-textarea" placeholder="Sim&#10;Ainda não&#10;Quero aprender"
                      value={(form.payload.options || []).join('\n')}
                      onChange={e => updatePayload('options', e.target.value.split('\n'))} />
                  </div>
                </>
              )}

              {form.type === 'quiz_question' && (
                <div className="form-group">
                  <label className="form-label">Questão do Quiz</label>
                  {quizQuestions.length === 0 ? (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--danger)' }}>
                      ⚠️ Nenhuma questão cadastrada. Vá em{' '}
                      <a href={`/admin/projects/${projectId}/webinars/${webinarId}/quiz`} target="_blank" style={{ color: 'var(--brand)' }}>📝 Quiz</a>{' '}
                      e adicione as perguntas primeiro.
                    </div>
                  ) : (
                    <select className="form-input form-select"
                      value={form.payload.question_id || ''}
                      onChange={e => updatePayload('question_id', e.target.value)}
                    >
                      <option value="">Selecione uma questão...</option>
                      {quizQuestions.map(q => (
                        <option key={q.id} value={q.id}>
                          {q.question.length > 80 ? q.question.slice(0, 80) + '…' : q.question}
                        </option>
                      ))}
                    </select>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    💡 A questão aparecerá como card interativo no chat da sala, com botões de resposta e simulação de votos automática.
                  </div>
                </div>
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
