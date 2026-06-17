'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import Modal from '@/components/Modal'
import type { ChatSegment } from '@/types'
import {
  CHAT_PHRASES_ELOGIOS,
  CHAT_PHRASES_VAGA,
  CHAT_PHRASES_ENGAJAMENTO,
  DEFAULT_NAMES,
} from '@/components/WebinarRoom'

const ALL_PHRASES = [...CHAT_PHRASES_ELOGIOS, ...CHAT_PHRASES_VAGA, ...CHAT_PHRASES_ENGAJAMENTO]

const OPENROUTER_MODELS = [
  { value: 'google/gemini-flash-1.5', label: 'Gemini 1.5 Flash (Google) — Mais rápido e barato' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (OpenAI) — Excelente custo-benefício' },
  { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (Anthropic) — Respostas naturais' },
  { value: 'mistralai/mistral-7b-instruct', label: 'Mistral 7B — Open source, muito barato' },
  { value: 'google/gemini-pro-1.5', label: 'Gemini 1.5 Pro (Google) — Mais avançado' },
  { value: 'openai/gpt-4o', label: 'GPT-4o (OpenAI) — Maior qualidade' },
]

const PHRASE_OPTIONS = [
  { value: null, label: 'Todas (mix)' },
  { value: 'elogios', label: '👏 Elogios' },
  { value: 'vaga', label: '🎉 Garantiu a Vaga' },
  { value: 'engajamento', label: '🔥 Engajamento' },
] as const

function fmtSec(s: number | null): string {
  if (s == null) return 'fim'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']

function getAvatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

type PreviewMsg = { id: number; name: string; text: string; type: string }

function ChatPreview({
  running, messages, namesPool, phrasesPool, cpm,
  onRunningChange, onMessagesChange, timerRef, counterRef,
}: {
  running: boolean
  messages: PreviewMsg[]
  namesPool: string[]
  phrasesPool: string[]
  cpm: number
  onRunningChange: (v: boolean) => void
  onMessagesChange: (fn: (prev: PreviewMsg[]) => PreviewMsg[]) => void
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  counterRef: React.MutableRefObject<number>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const intervalMs = Math.max(1500, Math.round(60000 / Math.max(cpm, 1)))

  const addMessage = useCallback(() => {
    if (!namesPool.length || !phrasesPool.length) return
    const name = namesPool[Math.floor(Math.random() * namesPool.length)]
    const text = phrasesPool[Math.floor(Math.random() * phrasesPool.length)]
    counterRef.current++
    onMessagesChange(prev => [...prev.slice(-19), { id: counterRef.current, name, text, type: 'chat' }])
  }, [namesPool, phrasesPool, onMessagesChange, counterRef])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(addMessage, intervalMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running, intervalMs, addMessage, timerRef])

  function handleStart() {
    addMessage() // immediate first
    onRunningChange(true)
  }
  function handlePause() { onRunningChange(false) }
  function handleReset() {
    onRunningChange(false)
    onMessagesChange(() => [])
    counterRef.current = 0
  }

  const effectiveInterval = intervalMs >= 60000
    ? `${Math.round(intervalMs / 60000)}min`
    : intervalMs >= 1000
    ? `${(intervalMs / 1000).toFixed(0)}s`
    : `${intervalMs}ms`

  return (
    <div style={{ width: '100%' }}>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {!running ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleStart}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            ▶ Simular
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={handlePause}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            ⏸ Pausar
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>↺ Resetar</button>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {cpm} msg/min · 1 msg a cada {effectiveInterval}
          {running && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>● ao vivo</span>}
        </div>
      </div>

      {/* Chat window mock */}
      <div ref={scrollRef} style={{
        height: 320, overflowY: 'auto', overflowX: 'hidden',
        background: 'var(--bg)', borderRadius: 12,
        border: '1px solid var(--border)', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
        scrollBehavior: 'smooth',
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: 'var(--text-muted)', fontSize: 13
          }}>
            <span style={{ fontSize: 32 }}>💬</span>
            <span>Clique em ▶ Simular para ver o chat em ação</span>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            animation: 'fadeSlideIn 0.25s ease',
          }}>
            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: getAvatarColor(msg.name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>
              {msg.name.charAt(0).toUpperCase()}
            </div>
            {/* Bubble */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: getAvatarColor(msg.name), marginBottom: 2 }}>
                {msg.name.split(' ')[0]}
              </div>
              <div style={{
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
                background: 'var(--bg-elevated)', borderRadius: '0 10px 10px 10px',
                padding: '7px 12px', display: 'inline-block', maxWidth: '100%',
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ---- Time helpers ----
function secToMmss(sec: number | null): string {
  if (sec == null || sec === 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
function mmssToSec(val: string): number {
  const trimmed = val.trim()
  if (!trimmed) return 0
  if (trimmed.includes(':')) {
    const [m, s] = trimmed.split(':').map(Number)
    return (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s)
  }
  return isNaN(Number(trimmed)) ? 0 : Number(trimmed)
}

function MmssInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  const [localVal, setLocalVal] = useState(value != null && value > 0 ? secToMmss(value) : '')
  const handleBlur = () => {
    if (!localVal.trim()) { onChange(null); return }
    onChange(mmssToSec(localVal))
  }
  return (
    <div>
      <input
        type="text"
        className="form-input"
        style={{ fontSize: 13 }}
        placeholder={placeholder ?? 'MM:SS (ex: 5:30)'}
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={handleBlur}
      />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
        {localVal ? `= ${fmtSec(mmssToSec(localVal))}` : placeholder === 'fim' ? 'Até o fim' : 'Desde o início'}
      </div>
    </div>
  )
}

const SEG_COLORS: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
  mix:        { bg: '#6366f122', border: '#6366f1', text: '#6366f1', label: 'Mix',        icon: '✨' },
  elogios:    { bg: '#3b82f622', border: '#3b82f6', text: '#3b82f6', label: 'Elogios',    icon: '👏' },
  engajamento:{ bg: '#f59e0b22', border: '#f59e0b', text: '#d97706', label: 'Engajamento',icon: '🔥' },
  vaga:       { bg: '#10b98122', border: '#10b981', text: '#059669', label: 'Vaga',        icon: '🎉' },
}

function SegmentTimeline({
  segments, onUpdate, onRemove, onAdd, videoDurationSec,
}: {
  segments: ChatSegment[]
  onUpdate: (idx: number, patch: Partial<ChatSegment>) => void
  onRemove: (idx: number) => void
  onAdd: () => void
  videoDurationSec: number
}) {
  // activeOrigIdx stores the INDEX in the **original** segments array
  const [activeOrigIdx, setActiveOrigIdx] = useState<number | null>(null)
  const totalSec = videoDurationSec || Math.max(...segments.map(s => s.to ?? 0), 3600)

  function segColor(seg: ChatSegment) {
    const key = seg.phrases ?? 'mix'
    return SEG_COLORS[key] ?? SEG_COLORS.mix
  }

  function pct(sec: number | null) {
    if (sec == null) return 100
    return Math.min(100, Math.max(0, (sec / totalSec) * 100))
  }

  // Preserve original index through sort so editor always refs the right segment
  const sortedSegs = segments
    .map((seg, originalIdx) => ({ seg, originalIdx }))
    .sort((a, b) => a.seg.from - b.seg.from)

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(SEG_COLORS).map(([k, c]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: c.text }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: c.border }} />
            {c.icon} {c.label}
          </div>
        ))}
      </div>

      {/* Timeline bar */}
      {segments.length === 0 ? (
        <div style={{
          height: 56, borderRadius: 10, border: '2px dashed var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer',
        }} onClick={onAdd}>
          Clique em "+ Adicionar Segmento" para começar →
        </div>
      ) : (
        <div style={{
          position: 'relative', height: 56, borderRadius: 10,
          background: 'var(--bg)', border: '1px solid var(--border)',
          overflow: 'hidden', marginBottom: 12,
        }}>
          {sortedSegs.map(({ seg, originalIdx }) => {
            const left = pct(seg.from)
            const right = 100 - pct(seg.to)
            const c = segColor(seg)
            const isActive = activeOrigIdx === originalIdx
            return (
              <button
                key={originalIdx}
                type="button"
                title={`${fmtSec(seg.from)} → ${fmtSec(seg.to)} · ${seg.cpm} msg/min`}
                onClick={() => setActiveOrigIdx(isActive ? null : originalIdx)}
                style={{
                  position: 'absolute', top: 4, bottom: 4,
                  left: `${left}%`, right: `${right}%`,
                  minWidth: 20,
                  background: c.bg,
                  border: `2px solid ${c.border}`,
                  borderRadius: 7,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: c.text,
                  overflow: 'hidden',
                  boxShadow: isActive ? `0 0 0 2px ${c.border}` : 'none',
                  transition: 'box-shadow 0.15s',
                }}
              >
                <span style={{ fontSize: 14 }}>{c.icon}</span>
                <span style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%', textOverflow: 'ellipsis', padding: '0 4px' }}>
                  {seg.cpm}cpm
                </span>
              </button>
            )
          })}
          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map(p => (
            <div key={p} style={{
              position: 'absolute', top: 0, bottom: 0, left: `${p}%`,
              width: 1, background: 'var(--border)', opacity: 0.4, pointerEvents: 'none',
            }} />
          ))}
        </div>
      )}

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 16 }}>
        <span>0:00</span>
        <span>{fmtSec(Math.round(totalSec * 0.25))}</span>
        <span>{fmtSec(Math.round(totalSec * 0.5))}</span>
        <span>{fmtSec(Math.round(totalSec * 0.75))}</span>
        <span>{fmtSec(totalSec)}</span>
      </div>

      {/* Inline editor for selected segment (uses originalIdx → always correct segment) */}
      {activeOrigIdx !== null && segments[activeOrigIdx] && (
        <div style={{
          background: 'var(--bg-elevated)', border: `1.5px solid ${segColor(segments[activeOrigIdx]).border}`,
          borderRadius: 12, padding: '16px', marginBottom: 14, animation: 'fadeSlideIn 0.2s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {segColor(segments[activeOrigIdx]).icon} Editando Segmento {activeOrigIdx + 1} —{' '}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>
                {fmtSec(segments[activeOrigIdx].from)} → {fmtSec(segments[activeOrigIdx].to)}
              </span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }}
                onClick={() => { onRemove(activeOrigIdx); setActiveOrigIdx(null) }}>
                🗑 Remover
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveOrigIdx(null)}>✕ Fechar</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Início (MM:SS)
              </label>
              <MmssInput
                value={segments[activeOrigIdx].from}
                onChange={v => onUpdate(activeOrigIdx, { from: v ?? 0 })}
                placeholder="0:00"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Fim (MM:SS)
              </label>
              <MmssInput
                value={segments[activeOrigIdx].to}
                onChange={v => onUpdate(activeOrigIdx, { to: v === 0 ? null : v })}
                placeholder="fim"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Intensidade
              </label>
              <input type="number" min={0} max={300} className="form-input" style={{ fontSize: 13 }}
                value={segments[activeOrigIdx].cpm}
                onChange={e => onUpdate(activeOrigIdx, { cpm: Number(e.target.value) })} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{segments[activeOrigIdx].cpm} msg/min</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {([{ label: '🐢', v: 2 }, { label: '🚶', v: 8 }, { label: '🔥', v: 15 }] as const).map(p => (
                  <button key={p.v} type="button"
                    className={`btn btn-sm ${segments[activeOrigIdx].cpm === p.v ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => onUpdate(activeOrigIdx, { cpm: p.v })}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pool de Frases
              </label>
              <select className="form-input form-select" style={{ fontSize: 13 }}
                value={segments[activeOrigIdx].phrases ?? ''}
                onChange={e => onUpdate(activeOrigIdx, { phrases: e.target.value === '' ? null : e.target.value as ChatSegment['phrases'] })}>
                {PHRASE_OPTIONS.map(opt => (
                  <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-sm" onClick={onAdd}>
        + Adicionar Segmento
      </button>
    </div>
  )
}

// ---- Phrase Pool Editor (Fix 3) ----
const PHRASE_COLORS: Record<string, { active: string; border: string; bg: string }> = {
  mix:        { active: '#8b5cf6', border: '#8b5cf622', bg: '#8b5cf608' },
  elogios:    { active: '#3b82f6', border: '#3b82f622', bg: '#3b82f608' },
  engajamento:{ active: '#f59e0b', border: '#f59e0b22', bg: '#f59e0b08' },
  vaga:       { active: '#10b981', border: '#10b98122', bg: '#10b98108' },
}

function PhrasePoolEditor({
  poolKey, icon, title, description,
  defaultPhrases, selected, onChange,
}: {
  poolKey: string
  icon: string
  title: string
  description: string
  defaultPhrases: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [customPhrases, setCustomPhrases] = useState<string[]>([])
  const colors = PHRASE_COLORS[poolKey] ?? PHRASE_COLORS.mix
  const allPhrases = [...defaultPhrases, ...customPhrases]

  function toggle(phrase: string) {
    if (selected.includes(phrase)) {
      onChange(selected.filter(p => p !== phrase))
    } else {
      onChange([...selected, phrase])
    }
  }

  function addCustom() {
    const trimmed = customInput.trim()
    if (!trimmed || allPhrases.includes(trimmed)) { setCustomInput(''); return }
    setCustomPhrases(prev => [...prev, trimmed])
    onChange([...selected, trimmed])
    setCustomInput('')
  }

  function selectAll() { onChange(allPhrases) }
  function clearAll() { onChange([]) }

  const activeCount = selected.length

  return (
    <div className="phrase-pool-card" style={{ 
      background: 'var(--bg-elevated)', 
      borderRadius: 12, 
      overflow: 'hidden', 
      border: `1px solid ${activeCount > 0 ? colors.border : 'var(--border)'}`,
      boxShadow: activeCount > 0 ? `0 4px 12px ${colors.active}0a` : 'none',
      transition: 'all 0.2s ease',
    }}>
      {/* Header / trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', background: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: activeCount > 0 ? colors.bg : 'var(--bg)',
          border: `1px solid ${activeCount > 0 ? colors.border : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
          transition: 'transform 0.2s ease',
        }} className="category-icon">
          {icon}
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ 
            fontWeight: 700, 
            fontSize: 15, 
            color: activeCount > 0 ? colors.active : 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
        </div>
        <div style={{
          background: activeCount > 0 ? colors.active : 'var(--bg)',
          color: activeCount > 0 ? '#fff' : 'var(--text-muted)',
          fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 20,
          border: `1px solid ${activeCount > 0 ? colors.active : 'var(--border)'}`,
          minWidth: 70, textAlign: 'center',
          boxShadow: activeCount > 0 ? `0 2px 8px ${colors.active}44` : 'none',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {activeCount > 0 ? `${activeCount} ativas` : 'padrão'}
        </div>
        <span style={{ 
          color: 'var(--text-muted)', 
          fontSize: 14, 
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
          transform: open ? 'rotate(180deg)' : 'none',
          marginLeft: 4
        }}>▾</span>
      </button>

      <style>{`
        .phrase-pool-card:hover {
          border-color: ${colors.active}66 !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px ${colors.active}12;
        }
        .phrase-pool-card:hover .category-icon {
          transform: scale(1.05);
        }
      `}</style>

      {open && (
        <div style={{ padding: 16 }}>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>✅ Todas</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll} style={{ color: '#ef4444' }}>✕ Nenhuma (usar padrão)</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {activeCount}/{allPhrases.length} selecionadas
            </span>
          </div>

          {/* Pills grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {allPhrases.map((phrase, i) => {
              const isSelected = selected.includes(phrase)
              const isCustom = i >= defaultPhrases.length
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(phrase)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12,
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: isSelected ? colors.active + '22' : 'var(--bg)',
                    border: `1.5px solid ${isSelected ? colors.active : 'var(--border)'}`,
                    color: isSelected ? colors.active : 'var(--text-secondary)',
                    fontWeight: isSelected ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {isCustom && <span style={{ fontSize: 10, opacity: 0.6 }}>★</span>}
                  {phrase}
                  {isSelected && <span style={{ fontSize: 10 }}>✓</span>}
                </button>
              )
            })}
          </div>

          {/* Add custom phrase */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Adicionar frase personalizada..."
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustom())}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={addCustom} disabled={!customInput.trim()}>
              + Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ChatConfigPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()
  const [webinarName, setWebinarName] = useState('')

  // Segments state
  const [segments, setSegments] = useState<ChatSegment[]>([])
  const [useSegments, setUseSegments] = useState(false)

  // Tabs
  const [activeTab, setActiveTab] = useState<'simulacao' | 'ia'>('simulacao')

  // AI State
  const [projectApiKey, setProjectApiKey] = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiModel, setAiModel] = useState('google/gemini-flash-1.5')
  const [aiKnowledgeBase, setAiKnowledgeBase] = useState('')
  const [aiSystemPrompt, setAiSystemPrompt] = useState('')
  const [aiPersonaName, setAiPersonaName] = useState('')
  const [aiPersonaAvatar, setAiPersonaAvatar] = useState('')

  // Global CPM state
  const [chatMode, setChatMode] = useState<'cpm' | 'interval'>('cpm')
  const [chatCpm, setChatCpm] = useState(0)
  const [chatIntervalMinutes, setChatIntervalMinutes] = useState(5)
  const [chatIntervalMessages, setChatIntervalMessages] = useState(1)
  const [chatStartSeconds, setChatStartSeconds] = useState(0)
  const [chatEndSeconds, setChatEndSeconds] = useState<string>('')
  const [chatPhrasesMix, setChatPhrasesMix] = useState<string[]>([])
  const [chatPhrasesElogios, setChatPhrasesElogios] = useState<string[]>([])
  const [chatPhrasesVaga, setChatPhrasesVaga] = useState<string[]>([])
  const [chatPhrasesEngajamento, setChatPhrasesEngajamento] = useState<string[]>([])
  const [chatNamesRaw, setChatNamesRaw] = useState('')
  const [chatDefaultTab, setChatDefaultTab] = useState<'chat' | 'qa'>('chat')
  const [badWordsFilter, setBadWordsFilter] = useState(false)
  const [disableQa, setDisableQa] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Express Mode state
  const [expressIntensity, setExpressIntensity] = useState(5)   // 1-10
  const [expressFocus, setExpressFocus] = useState<'elogios' | 'engajamento' | 'vaga' | 'mix'>('mix')
  const [expressVoices, setExpressVoices] = useState(20)         // 5-80 (names count)
  const [expressApplied, setExpressApplied] = useState(false)

  // AI Generator specific state
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiScriptText, setAiScriptText] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiDiff, setAiDiff] = useState<null | {
    names: string[]
    phrasesMix: string[]
    phrasesElogios: string[]
    phrasesEngajamento: string[]
    phrasesVaga: string[]
    segments: { from: number; to: number | null; cpm: number; phrases: string | null }[]
  }>(null)

  // Preview live state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRunning, setPreviewRunning] = useState(false)
  const [previewMessages, setPreviewMessages] = useState<{ id: number; name: string; text: string; type: string }[]>([])
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewCounterRef = useRef(0)

  // Sandbox State
  const [sandboxMessages, setSandboxMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [sandboxInput, setSandboxInput] = useState('')
  const [sandboxTyping, setSandboxTyping] = useState(false)

  async function sendSandboxMessage() {
    const text = sandboxInput.trim()
    if (!text || sandboxTyping) return

    setSandboxInput('')
    const newMsg = { role: 'user' as const, content: text }
    const updatedMessages = [...sandboxMessages, newMsg]
    setSandboxMessages(updatedMessages)
    setSandboxTyping(true)

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          webinar_id: webinarId,
          history: sandboxMessages, // pass current sandbox history
          overrides: {
            ai_enabled: aiEnabled,
            ai_model: aiModel,
            ai_knowledge_base: aiKnowledgeBase,
            ai_system_prompt: aiSystemPrompt
          }
        })
      })

      const data = await res.json()
      if (data.answer) {
        setSandboxMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
      } else if (data.skip) {
        setSandboxMessages(prev => [...prev, { role: 'assistant', content: '⚠️ IA ignorou esta mensagem ou não foi possível obter resposta (verifique a API Key do OpenRouter nos Ajustes do Projeto).' }])
      }
    } catch (err) {
      setSandboxMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro ao se conectar com o servidor.' }])
    } finally {
      setSandboxTyping(false)
    }
  }

  async function handleGenerateAi() {
    if (!aiScriptText.trim()) return toast.error('Digite o roteiro ou contexto da aula.')
    setAiGenerating(true)
    try {
      const res = await fetch('/api/ai-script-to-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, script: aiScriptText })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao gerar chat falso')

      if (json.names?.length) setChatNamesRaw(json.names.join('\n'))
      if (json.phrasesMix?.length) setChatPhrasesMix(json.phrasesMix)
      if (json.phrasesElogios?.length) setChatPhrasesElogios(json.phrasesElogios)
      if (json.phrasesEngajamento?.length) setChatPhrasesEngajamento(json.phrasesEngajamento)
      if (json.phrasesVaga?.length) setChatPhrasesVaga(json.phrasesVaga)
      const parsedSegments = json.segments?.length
        ? json.segments.map((s: any) => ({ from: s.from, to: s.to, cpm: s.cpm || 5, phrases: s.phrases === 'mix' ? null : s.phrases }))
        : []
      if (parsedSegments.length) { setSegments(parsedSegments); setUseSegments(true) }

      setAiDiff({
        names: json.names || [],
        phrasesMix: json.phrasesMix || [],
        phrasesElogios: json.phrasesElogios || [],
        phrasesEngajamento: json.phrasesEngajamento || [],
        phrasesVaga: json.phrasesVaga || [],
        segments: parsedSegments,
      })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAiGenerating(false)
    }
  }

  function handleDiffConfirm(andSave: boolean) {
    setAiDiff(null)
    setShowAiModal(false)
    setAiScriptText('')
    if (andSave) {
      save()
    } else {
      toast.success('Dados preenchidos! Revise e clique em Salvar quando estiver pronto.', { duration: 5000 })
    }
  }

  useEffect(() => {
    async function load() {
      const [{ data }, { data: project }] = await Promise.all([
        supabase
          .from('webi_webinars')
          .select('name, chat_cpm, chat_names, chat_default_tab, chat_mode, chat_interval_minutes, chat_interval_messages, chat_start_seconds, chat_end_seconds, chat_phrases, chat_phrases_elogios, chat_phrases_vaga, chat_phrases_engajamento, chat_segments, ai_enabled, ai_model, ai_knowledge_base, ai_system_prompt, ai_persona_name, ai_persona_avatar, bad_words_filter, disable_qa')
          .eq('id', webinarId)
          .single(),
        supabase.from('webi_projects').select('openrouter_api_key').eq('id', projectId).single(),
      ])
      if (data) {
        setWebinarName(data.name)
        setChatCpm(data.chat_cpm || 0)
        setChatMode((data.chat_mode as 'cpm' | 'interval') || 'cpm')
        setChatIntervalMinutes(data.chat_interval_minutes || 5)
        setChatIntervalMessages((data as any).chat_interval_messages || 1)
        setChatStartSeconds(data.chat_start_seconds || 0)
        setChatEndSeconds(data.chat_end_seconds != null ? String(data.chat_end_seconds) : '')
        const names = data.chat_names as string[] | null
        if (Array.isArray(names) && names.length > 0) setChatNamesRaw(names.join('\n'))
        const phrases = data.chat_phrases as string[] | null
        if (Array.isArray(phrases) && phrases.length > 0) setChatPhrasesMix(phrases)

        const phrasesElogios = (data as any).chat_phrases_elogios as string[] | null
        if (Array.isArray(phrasesElogios) && phrasesElogios.length > 0) setChatPhrasesElogios(phrasesElogios)
        
        const phrasesVaga = (data as any).chat_phrases_vaga as string[] | null
        if (Array.isArray(phrasesVaga) && phrasesVaga.length > 0) setChatPhrasesVaga(phrasesVaga)
        
        const phrasesEngajamento = (data as any).chat_phrases_engajamento as string[] | null
        if (Array.isArray(phrasesEngajamento) && phrasesEngajamento.length > 0) setChatPhrasesEngajamento(phrasesEngajamento)

        if (data.chat_default_tab === 'qa') setChatDefaultTab('qa')
        const segs = data.chat_segments as ChatSegment[] | null
        if (Array.isArray(segs) && segs.length > 0) {
          setSegments(segs)
          setUseSegments(true)
        }
        setBadWordsFilter(data.bad_words_filter || false)
        setDisableQa((data as any).disable_qa || false)
        setAiEnabled(data.ai_enabled || false)
        setAiModel(data.ai_model || 'google/gemini-flash-1.5')
        setAiKnowledgeBase(data.ai_knowledge_base || '')
        setAiSystemPrompt(data.ai_system_prompt || '')
        setAiPersonaName((data as Record<string, unknown>).ai_persona_name as string || '')
        setAiPersonaAvatar((data as Record<string, unknown>).ai_persona_avatar as string || '')
      }
      if (project) setProjectApiKey(project.openrouter_api_key || '')
      setLoading(false)
    }
    load()
  }, [webinarId])

  async function save() {
    setSaving(true)
    const namesArray = chatNamesRaw.split('\n').map(n => n.trim()).filter(Boolean)
    const endSec = chatEndSeconds.trim() !== '' ? Number(chatEndSeconds) : null
    await Promise.all([
      supabase.from('webi_webinars').update({
        chat_cpm: chatMode === 'cpm' ? chatCpm : 0,
        chat_names: namesArray,
        chat_default_tab: chatDefaultTab,
        chat_mode: chatMode,
        chat_interval_minutes: chatIntervalMinutes,
        chat_interval_messages: chatIntervalMessages,
        chat_start_seconds: chatStartSeconds,
        chat_end_seconds: endSec,
        chat_phrases: chatPhrasesMix.length > 0 ? chatPhrasesMix : null,
        chat_phrases_elogios: chatPhrasesElogios.length > 0 ? chatPhrasesElogios : null,
        chat_phrases_vaga: chatPhrasesVaga.length > 0 ? chatPhrasesVaga : null,
        chat_phrases_engajamento: chatPhrasesEngajamento.length > 0 ? chatPhrasesEngajamento : null,
        chat_segments: useSegments && segments.length > 0 ? segments : null,
        ai_enabled: aiEnabled,
        ai_model: aiModel,
        ai_knowledge_base: aiKnowledgeBase,
        ai_system_prompt: aiSystemPrompt,
        ai_persona_name: aiPersonaName,
        ai_persona_avatar: aiPersonaAvatar,
        bad_words_filter: badWordsFilter,
        disable_qa: disableQa,
      }).eq('id', webinarId),
      supabase.from('webi_projects').update({ openrouter_api_key: projectApiKey }).eq('id', projectId)
    ])
    setSaving(false)
    toast.success('Chat salvo!')
  }

  function addSegment() {
    const lastTo = segments.length > 0 ? (segments[segments.length - 1].to ?? 0) : 0
    setSegments(s => [...s, { from: lastTo, to: null, cpm: 5, phrases: null }])
  }

  function updateSegment(idx: number, patch: Partial<ChatSegment>) {
    setSegments(s => s.map((seg, i) => i === idx ? { ...seg, ...patch } : seg))
  }

  function removeSegment(idx: number) {
    setSegments(s => s.filter((_, i) => i !== idx))
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const namesArray = chatNamesRaw.split('\n').map(n => n.trim()).filter(Boolean)

  // ---- Computed diagnostics ----
  const diagNamesCount = namesArray.length
  const diagMixCount = chatPhrasesMix.length
  const diagElogiosCount = chatPhrasesElogios.length
  const diagVagaCount = chatPhrasesVaga.length
  const diagEngCount = chatPhrasesEngajamento.length
  const isSimulationActive = chatCpm > 0 || useSegments

  // Segment coverage warnings
  const diagSegWarnings: string[] = []
  if (useSegments && segments.length > 0) {
    segments.forEach((seg, i) => {
      const hasCustomPhrases =
        seg.phrases === 'elogios' ? diagElogiosCount > 0
        : seg.phrases === 'vaga' ? diagVagaCount > 0
        : seg.phrases === 'engajamento' ? diagEngCount > 0
        : diagMixCount > 0
      if (!hasCustomPhrases) diagSegWarnings.push(`Segmento ${i + 1} (${fmtSec(seg.from)}–${fmtSec(seg.to)}) sem frases personalizadas — usará padrão`)
    })
  } else if (!useSegments && isSimulationActive) {
    if (diagMixCount === 0) diagSegWarnings.push('Nenhuma frase personalizada — usando pool padrão do sistema')
  }

  const diagStatus = !isSimulationActive ? 'off'
    : diagSegWarnings.length > 0 ? 'warn'
    : 'ok'

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">💬 Chat & IA</h1>
          <p className="page-subtitle">Configure a simulação de chat e o assistente de Inteligência Artificial para responder dúvidas</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="spinner" /> : '💾 Salvar Alterações'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('simulacao')}
            className={`btn ${activeTab === 'simulacao' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '10px 20px', borderRadius: 20 }}
          >
            {activeTab === 'simulacao' ? '✅' : '💬'} Simulação Fictícia
          </button>
          <button
            onClick={() => setActiveTab('ia')}
            className={`btn ${activeTab === 'ia' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '10px 20px', borderRadius: 20 }}
          >
            {activeTab === 'ia' ? '✅' : '🤖'} Assistente IA
          </button>
        </div>
        
        {activeTab === 'simulacao' && (
          <button onClick={() => setShowAiModal(true)} className="btn btn-primary" style={{ background: 'linear-gradient(45deg, #8b5cf6, #ec4899)', border: 'none', color: '#fff', borderRadius: 20, padding: '10px 20px' }}>
            ✨ Gerar Simulação via Roteiro (IA)
          </button>
        )}
      </div>

      <div className="page-body" style={{ display: activeTab === 'simulacao' ? 'flex' : 'none', flexDirection: 'column', gap: 20 }}>

        {/* ---- DIAGNOSTIC STATUS CARD ---- */}
        <div className="card" style={{
          border: `1.5px solid ${
            diagStatus === 'ok' ? 'rgba(34,197,94,0.35)'
            : diagStatus === 'warn' ? 'rgba(245,158,11,0.4)'
            : 'rgba(239,68,68,0.3)'
          }`,
          background: `${
            diagStatus === 'ok' ? 'rgba(34,197,94,0.04)'
            : diagStatus === 'warn' ? 'rgba(245,158,11,0.04)'
            : 'rgba(239,68,68,0.04)'
          }`,
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>
                {diagStatus === 'ok' ? '✅' : diagStatus === 'warn' ? '⚠️' : '🚫'}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {diagStatus === 'ok' ? 'Simulação configurada e ativa'
                   : diagStatus === 'warn' ? 'Simulação ativa com avisos'
                   : 'Simulação desativada'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {diagStatus === 'off'
                    ? 'Configure a frequência (CPM) ou ative os segmentos para ligar a simulação.'
                    : useSegments
                    ? `${segments.length} segmento(s) ativos · modo por trechos`
                    : `Frequência global · ${chatCpm} msg/min`
                  }
                </div>
              </div>
            </div>

            {/* On/Off action button */}
            {isSimulationActive ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', whiteSpace: 'nowrap' }}
                onClick={() => { setChatMode('cpm'); setChatCpm(0); setUseSegments(false); toast('Simulação Fictícia foi desativada.', { icon: '🛑' }) }}
              >
                🛑 Desativar
              </button>
            ) : (
              <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>CPM = 0</div>
            )}
          </div>

          {/* Metrics row */}
          {isSimulationActive && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: 10,
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
            }}>
              {([
                { label: 'Nomes', value: diagNamesCount > 0 ? diagNamesCount : `${DEFAULT_NAMES.length} padrão`, icon: '👥', custom: diagNamesCount > 0 },
                { label: 'Mix de Frases', value: diagMixCount > 0 ? diagMixCount : 'padrão', icon: '✨', custom: diagMixCount > 0 },
                { label: 'Elogios', value: diagElogiosCount > 0 ? diagElogiosCount : 'padrão', icon: '👏', custom: diagElogiosCount > 0 },
                { label: 'Engajamento', value: diagEngCount > 0 ? diagEngCount : 'padrão', icon: '🔥', custom: diagEngCount > 0 },
                { label: 'Garantiu Vaga', value: diagVagaCount > 0 ? diagVagaCount : 'padrão', icon: '🎉', custom: diagVagaCount > 0 },
              ] as { label: string; value: string | number; icon: string; custom: boolean }[]).map(m => (
                <div key={m.label} style={{
                  background: 'var(--bg-elevated)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{m.icon}</div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: m.custom ? 'var(--brand-light)' : 'var(--text-muted)',
                  }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {diagSegWarnings.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {diagSegWarnings.map((w, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12, color: '#d97706',
                }}>
                  <span>⚠️</span><span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- SEGURANÇA / FILTROS ---- */}
        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🛑 Filtro de Palavrões e Ofensas</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Quando ativo, mensagens enviadas por usuários reais contendo palavrões serão ocultadas ou ignoradas.
            </div>
          </div>
          <div>
            <button
              type="button"
              className={`btn ${badWordsFilter ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setBadWordsFilter(!badWordsFilter)}
            >
              {badWordsFilter ? '✅ Filtro Ativo' : 'Ativar Filtro'}
            </button>
          </div>
        </div>

        {/* ---- DESATIVAR Q&A ---- */}
        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>❓ Ocultar aba Q&A na sala</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Quando ativo, a aba de perguntas e respostas (Q&A) será ocultada na sala do webinar para os participantes.
            </div>
          </div>
          <div>
            <button
              type="button"
              className={`btn ${disableQa ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDisableQa(!disableQa)}
            >
              {disableQa ? '✅ Q&A Ocultado' : 'Ocultar Q&A'}
            </button>
          </div>
        </div>

        {/* ---- EXPRESS MODE CARD ---- */}
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(168,85,247,0.05) 100%)',
          border: '1.5px solid rgba(99,102,241,0.25)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800 }}>⚡ Configuração Rápida</span>
                {expressApplied && <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>✓ Aplicado</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                Gera segmentos de chat automaticamente em 3 cliques. Perfeito para começar rápido.
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginTop: 16 }}>

            {/* Slider 1 — Intensidade */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>🔥 Intensidade</label>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-light)' }}>
                  {expressIntensity <= 3 ? '🐢 Suave' : expressIntensity <= 6 ? '🚶 Moderada' : expressIntensity <= 8 ? '⚡ Alta' : '🚀 Máxima'}
                </span>
              </div>
              <input
                type="range" min={1} max={10} step={1}
                value={expressIntensity}
                onChange={e => setExpressIntensity(+e.target.value)}
                style={{ width: '100%', accentColor: '#6366f1' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                <span>Calmo</span><span>Frenético</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                💡 Alta intensidade no pitch cria senso de urgência nas vendas.
              </div>
            </div>

            {/* Slider 2 — Foco das frases */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>🎯 Foco do Chat</label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {([
                  { val: 'mix', icon: '✨', label: 'Mix Balanceado', hint: 'Um pouco de tudo' },
                  { val: 'elogios', icon: '👏', label: 'Elogios & Aprovação', hint: 'Cria social proof' },
                  { val: 'engajamento', icon: '🔥', label: 'Engajamento & Perguntas', hint: 'Mantém atenção' },
                  { val: 'vaga', icon: '🎉', label: 'Garantia de Vaga', hint: 'Gera urgência nas compras' },
                ] as const).map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setExpressFocus(opt.val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      borderRadius: 8, border: `1.5px solid ${expressFocus === opt.val ? '#6366f1' : 'var(--border)'}`,
                      background: expressFocus === opt.val ? 'rgba(99,102,241,0.1)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: expressFocus === opt.val ? '#818cf8' : 'var(--text-primary)' }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{opt.hint}</div>
                    </div>
                    {expressFocus === opt.val && <span style={{ marginLeft: 'auto', color: '#6366f1', fontSize: 14 }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Slider 3 — Número de vozes */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>👥 Diversidade de Vozes</label>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-light)' }}>{expressVoices} nomes</span>
              </div>
              <input
                type="range" min={5} max={80} step={5}
                value={expressVoices}
                onChange={e => setExpressVoices(+e.target.value)}
                style={{ width: '100%', accentColor: '#6366f1' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                <span>Poucos (+ íntimo)</span><span>Muitos (+ diverso)</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                💡 {'>'} 40 vozes diferentes → sensação de sala cheia e ativa.
              </div>

              {/* Preview do config resultante */}
              <div style={{
                marginTop: 16, background: 'var(--bg)', borderRadius: 10, padding: 12,
                border: '1px solid var(--border)', fontSize: 12,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>📋 Resultado esperado:</div>
                {(() => {
                  const cpmBase = [2, 4, 6, 8, 10, 13, 18, 25, 35, 50][expressIntensity - 1]
                  const cpmLow = Math.round(cpmBase * 0.5)
                  const cpmHigh = Math.round(cpmBase * 1.8)
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-muted)' }}>
                      <span>• <strong style={{ color: 'var(--text-primary)' }}>3 segmentos</strong> automáticos gerados</span>
                      <span>• Início: <strong style={{ color: 'var(--text-primary)' }}>{cpmLow} msg/min</strong></span>
                      <span>• Pico: <strong style={{ color: 'var(--text-primary)' }}>{cpmHigh} msg/min</strong></span>
                      <span>• Foco: <strong style={{ color: '#818cf8' }}>{expressFocus === 'mix' ? 'Mix Balanceado' : expressFocus === 'elogios' ? 'Elogios' : expressFocus === 'engajamento' ? 'Engajamento' : 'Garantia de Vaga'}</strong></span>
                      <span>• {expressVoices} nomes únicos (gerados automaticamente)</span>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Apply button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, gap: 10 }}>
            {expressApplied && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--text-muted)', fontSize: 12 }}
                onClick={() => {
                  setUseSegments(false)
                  setSegments([])
                  setChatCpm(0)
                  setExpressApplied(false)
                  toast('Configuração rápida removida.', { icon: '🗑' })
                }}
              >
                ✕ Desfazer
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none' }}
              onClick={() => {
                // Generate segments from sliders
                const cpmBase = [2, 4, 6, 8, 10, 13, 18, 25, 35, 50][expressIntensity - 1]
                const dur = chatEndSeconds.trim() ? Number(chatEndSeconds) : 3600
                const t1 = Math.round(dur * 0.33)
                const t2 = Math.round(dur * 0.66)
                const phr = expressFocus === 'mix' ? null : expressFocus
                const newSegs: ChatSegment[] = [
                  { from: 0,  to: t1,  cpm: Math.round(cpmBase * 0.5),  phrases: phr },
                  { from: t1, to: t2,  cpm: cpmBase,                       phrases: phr },
                  { from: t2, to: null, cpm: Math.round(cpmBase * 1.8),  phrases: phr },
                ]
                // Auto-generate N names from the default pool
                const pool = DEFAULT_NAMES
                const shuffled = [...pool].sort(() => Math.random() - 0.5)
                const chosen = Array.from({ length: expressVoices }, (_, i) => shuffled[i % shuffled.length])
                const uniqueChosen = [...new Set(chosen)]
                setChatNamesRaw(uniqueChosen.join('\n'))
                setSegments(newSegs)
                setUseSegments(true)
                setChatMode('cpm')
                setExpressApplied(true)
                toast.success(`⚡ Configuração aplicada! ${newSegs.length} segmentos gerados.`)
              }}
            >
              ⚡ Aplicar Configuração Rápida
            </button>
          </div>
        </div>

        {/* ---- SEGMENTS ---- */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>📋 Segmentos por Trecho do Vídeo</div>
            <button
              type="button"
              className={`btn btn-sm ${useSegments ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                if (!useSegments && segments.length === 0) addSegment()
                setUseSegments(v => !v)
              }}
            >
              {useSegments ? '✅ Ativo' : 'Ativar'}
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Configure CPMs e frases diferentes para cada trecho do vídeo. Quando ativo, sobrepõe as configurações globais abaixo.
          </div>

          {useSegments ? (
            <SegmentTimeline
              segments={segments}
              onUpdate={updateSegment}
              onRemove={removeSegment}
              onAdd={addSegment}
              videoDurationSec={chatEndSeconds ? Number(chatEndSeconds) : 3600}
            />
          ) : (
            segments.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {segments.length} segmento(s) salvos, mas desativados. Ative para usar.
              </div>
            )
          )}
        </div>

        {/* ---- GLOBAL FREQUENCY ---- */}
        <div className="card" style={{ opacity: useSegments ? 0.5 : 1, pointerEvents: useSegments ? 'none' : 'auto' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            ⏱ Frequência Global
            {useSegments && (
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#f59e0b' }}>
                (sobreposto por segmentos)
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Frequência única para todo o vídeo. Use os segmentos acima para variação por trecho.
            Use <strong style={{ color: 'var(--text-primary)' }}>0</strong> para desativar.
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className={`btn btn-sm ${chatCpm === 2 && chatMode === 'cpm' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setChatMode('cpm'); setChatCpm(2); }}>🐢 Lento / Calmo</button>
            <button type="button" className={`btn btn-sm ${chatCpm === 8 && chatMode === 'cpm' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setChatMode('cpm'); setChatCpm(8); }}>🚶 Normal</button>
            <button type="button" className={`btn btn-sm ${chatCpm === 15 && chatMode === 'cpm' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setChatMode('cpm'); setChatCpm(15); }}>🔥 Agitado</button>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 8px' }} />
            
            <select className="form-input" style={{ width: 220, padding: '6px 10px', fontSize: 13 }} value={chatMode} onChange={e => setChatMode(e.target.value as any)}>
              <option value="cpm">Velocidade (CPM / msgs por min)</option>
              <option value="interval">Intervalo exato</option>
            </select>
          </div>

          {chatMode === 'cpm' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input
                type="range" min={0} max={300} step={1}
                value={chatCpm}
                onChange={e => setChatCpm(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--brand)' }}
              />
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 12px', minWidth: 100, textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center'
              }}>
                <input
                  type="number"
                  value={chatCpm}
                  onChange={e => setChatCpm(Number(e.target.value))}
                  style={{ 
                    fontSize: 22, fontWeight: 800, textAlign: 'center', 
                    color: chatCpm > 0 ? 'var(--brand-light)' : 'var(--text-muted)',
                    background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', 
                    outline: 'none', width: '100%', padding: '0 0 2px 0'
                  }}
                  min={0}
                  max={999}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>msg/min</div>
                {chatCpm > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {chatCpm > 30
                      ? `≈ ${(chatCpm / 60).toFixed(1)}/s`
                      : `1 a cada ${Math.round(60 / chatCpm)}s`}
                  </div>
                )}
                {chatCpm >= 60 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>ENXURRADA</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="number"
                min={1} max={100}
                className="form-input"
                style={{ width: 80 }}
                value={chatIntervalMessages}
                onChange={e => setChatIntervalMessages(Number(e.target.value))}
              />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {chatIntervalMessages === 1 ? 'mensagem a cada' : 'mensagens a cada'}
              </span>
              <select
                className="form-input"
                style={{ width: 120 }}
                value={chatIntervalMinutes}
                onChange={e => setChatIntervalMinutes(Number(e.target.value))}
              >
                {[1, 2, 3, 5, 10, 15, 20, 30, 60].map(v => (
                  <option key={v} value={v}>{v} {v === 1 ? 'minuto' : 'minutos'}</option>
                ))}
              </select>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                ≈ {(chatIntervalMessages / chatIntervalMinutes).toFixed(2)} msg/min
              </span>
            </div>
          )}
        </div>

        {/* ---- TIME WINDOW (global only) ---- */}
        <div className="card" style={{ opacity: useSegments ? 0.5 : 1, pointerEvents: useSegments ? 'none' : 'auto' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🪟 Janela de Exibição Global</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Defina em que momento do vídeo a simulação começa e termina. Ignorado quando segmentos estão ativos.
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 140 }}>
              <label className="form-label" style={{ marginBottom: 4, display: 'block' }}>Início (MM:SS)</label>
              <input
                type="text"
                className="form-input"
                style={{ width: 140 }}
                placeholder="0:00"
                defaultValue={chatStartSeconds > 0 ? secToMmss(chatStartSeconds) : ''}
                onBlur={e => setChatStartSeconds(mmssToSec(e.target.value))}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {chatStartSeconds > 0 ? fmtSec(chatStartSeconds) : 'Desde o início'}
              </div>
            </div>
            <div style={{ fontSize: 18, color: 'var(--text-muted)', paddingTop: 32 }}>→</div>
            <div style={{ minWidth: 140 }}>
              <label className="form-label" style={{ marginBottom: 4, display: 'block' }}>Fim (MM:SS)</label>
              <input
                type="text"
                className="form-input"
                style={{ width: 140 }}
                placeholder="Até o fim"
                defaultValue={chatEndSeconds ? secToMmss(Number(chatEndSeconds)) : ''}
                onBlur={e => {
                  const v = e.target.value.trim()
                  setChatEndSeconds(v ? String(mmssToSec(v)) : '')
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {chatEndSeconds ? fmtSec(Number(chatEndSeconds)) : 'Até o fim do vídeo'}
              </div>
            </div>
          </div>
        </div>

        {/* ---- PHRASES ---- */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💬 Biblioteca de Mensagens Simuladas</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Clique em cada categoria para selecionar as frases ativas. Frases marcadas ✓ serão usadas na simulação.
            Quando nenhuma estiver selecionada, o sistema usa o pool padrão automaticamente.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PhrasePoolEditor
              poolKey="mix"
              icon="✨"
              title="Mix Geral"
              description="Usado no modo global e em segmentos sem categoria específica"
              defaultPhrases={ALL_PHRASES}
              selected={chatPhrasesMix}
              onChange={setChatPhrasesMix}
            />
            <PhrasePoolEditor
              poolKey="elogios"
              icon="👏"
              title="Elogios"
              description="Usado em segmentos do tipo Elogios — reações positivas ao conteúdo"
              defaultPhrases={CHAT_PHRASES_ELOGIOS}
              selected={chatPhrasesElogios}
              onChange={setChatPhrasesElogios}
            />
            <PhrasePoolEditor
              poolKey="engajamento"
              icon="🔥"
              title="Engajamento"
              description="Usado em segmentos de alta energia — reações e comentários de participação"
              defaultPhrases={CHAT_PHRASES_ENGAJAMENTO}
              selected={chatPhrasesEngajamento}
              onChange={setChatPhrasesEngajamento}
            />
            <PhrasePoolEditor
              poolKey="vaga"
              icon="🎉"
              title="Garantiu a Vaga"
              description="Usado em segmentos de pitch/oferta — confirmações de compra"
              defaultPhrases={CHAT_PHRASES_VAGA}
              selected={chatPhrasesVaga}
              onChange={setChatPhrasesVaga}
            />
          </div>
        </div>

        {/* ---- NAMES ---- */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👥 Pool de Participantes Fictícios</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Um por linha. Usado em todos os modos. Deixe vazio para usar os {DEFAULT_NAMES.length} nomes brasileiros padrão.
          </div>
          <div style={{ marginBottom: 10 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChatNamesRaw(DEFAULT_NAMES.join('\n'))}>
              👥 Preencher com {DEFAULT_NAMES.length} nomes padrão
            </button>
            {chatNamesRaw && (
              <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 8, color: 'var(--text-muted)' }} onClick={() => setChatNamesRaw('')}>
                ✕ Usar padrão
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                Nomes — {namesArray.length > 0 ? `${namesArray.length} cadastrados` : `usando ${DEFAULT_NAMES.length} padrão`}
              </label>
              <textarea
                className="form-input form-textarea"
                style={{ minHeight: 180, fontSize: 13 }}
                placeholder={DEFAULT_NAMES.slice(0, 8).join('\n')}
                value={chatNamesRaw}
                onChange={e => setChatNamesRaw(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Preview de compras</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(namesArray.length > 0 ? namesArray.slice(0, 4) : DEFAULT_NAMES.slice(0, 4)).map((name, i) => (
                  <div key={i} style={{
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 8, padding: '10px 14px', fontSize: 13
                  }}>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>🛒 {name.split(' ')[0]}</span>
                    <span style={{ color: 'var(--text-secondary)' }}> acabou de garantir sua vaga! 🎉</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---- DEFAULT TAB ---- */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📌 Aba Padrão do Chat</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Qual aba estará ativa quando o participante entrar na sala.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['chat', 'qa'] as const).map(tab => (
              <button key={tab} type="button"
                className={`btn btn-sm ${chatDefaultTab === tab ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setChatDefaultTab(tab)}
              >
                {tab === 'chat' ? '💬 Chat' : '❓ Q&A only'}
              </button>
            ))}
          </div>
        </div>

        {/* ---- LIVE PREVIEW ---- */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          {/* Header */}
          <button
            type="button"
            onClick={() => setPreviewOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 20px', background: 'none', cursor: 'pointer',
              borderBottom: previewOpen ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>👁</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Preview do Chat ao Vivo</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Veja como as mensagens aparecerão para os espectadores</div>
              </div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 18, transition: 'transform 0.2s', transform: previewOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>

          {previewOpen && (
            <div style={{ padding: '16px 20px' }}>
              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <ChatPreview
                  running={previewRunning}
                  messages={previewMessages}
                  namesPool={namesArray.length > 0 ? namesArray : DEFAULT_NAMES}
                  phrasesPool={[
                    ...(chatPhrasesMix.length > 0 ? chatPhrasesMix : ALL_PHRASES),
                    ...(chatPhrasesElogios.length > 0 ? chatPhrasesElogios : CHAT_PHRASES_ELOGIOS),
                    ...(chatPhrasesEngajamento.length > 0 ? chatPhrasesEngajamento : CHAT_PHRASES_ENGAJAMENTO),
                    ...(chatPhrasesVaga.length > 0 ? chatPhrasesVaga : CHAT_PHRASES_VAGA),
                  ]}
                  cpm={chatCpm > 0 ? chatCpm : 5}
                  onRunningChange={setPreviewRunning}
                  onMessagesChange={setPreviewMessages}
                  timerRef={previewTimerRef}
                  counterRef={previewCounterRef}
                />
              </div>
            </div>
          )}
        </div>

        {/* ---- BROADCAST INFO ---- */}
        <div style={{
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12
        }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Efeito de Manada (Provas Sociais) no Pitch:</strong>{' '}
            Quando o botão de compra (Pitch) for disparado pela aba Monitoramento, o chat piscará uma enxurrada orgânica de &quot;<em>[Nome] acabou de garantir a vaga!</em>&quot;. Isso ativa a Urgência Extrema e o viés de escassez, forçando os leads passivos a passarem o cartão antes que &quot;acabem as vagas&quot;.
          </div>
        </div>
      </div>

      {/* ---- AI CONFIG TAB ---- */}
      <div className="page-body" style={{ display: activeTab === 'ia' ? 'flex' : 'none', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Ativar Assistente de IA Autônomo</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 640, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--brand)' }}>O segredo dos Webinars Milionários:</span> Enquanto você faz o pitch no vídeo, centenas de pessoas mandarão dúvidas no chat. Em vez de depender de 5 humanos, a IA responde dúvidas de compra, parcelamento e garantia em segundos, quebrando objeções no ato e transformando céticos em novos alunos automaticamente.
            </div>
          </div>
          <label style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
            <input type="checkbox" checked={aiEnabled} onChange={e => setAiEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: 99, background: aiEnabled ? '#6366f1' : 'var(--border)', transition: '0.3s' }}>
              <span style={{ position: 'absolute', height: 18, width: 18, left: aiEnabled ? 22 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
            </span>
          </label>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, opacity: aiEnabled ? 1 : 0.5, pointerEvents: aiEnabled ? 'auto' : 'none' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>OpenRouter API Key</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Você pode gerenciar e adicionar as chaves de inteligência artificial unificadas na página <strong>Ajustes do Projeto</strong>. Essa chave será detectada pela IA do webinar automaticamente e utilizada.</div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, opacity: aiEnabled ? 1 : 0.5, pointerEvents: aiEnabled ? 'auto' : 'none' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Modelo de IA</div>
          <select className="form-input" value={aiModel} onChange={e => setAiModel(e.target.value)}>
            {OPENROUTER_MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, opacity: aiEnabled ? 1 : 0.5, pointerEvents: aiEnabled ? 'auto' : 'none' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Base de Conhecimento (Guia de Objeções)</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
             Crie o &quot;Cérebro Comercial&quot; da Inteligência Artificial. Forneça o que ela precisa para vender: Promessa Forte, Preços (Pix/Cartão), tempo de Garantia (7 ou 30 dias?), e as 5 perguntas que mais matam suas vendas. Quando o lead disser <em>&quot;Acesso é de um ano?&quot;</em>, a IA lerá esse guia e responderá cirurgicamente focada em conversão.
          </div>
          <textarea className="form-input" rows={8} placeholder="PRODUTO: Formação Y&#10;PREÇO: R$ 997,00 à vista no Pix, ou 12x de R$ 97 no Cartão&#10;DÚVIDA 1: Divide no boleto? Resposta: Infelizmente não! Apenas cartão 12x!..." value={aiKnowledgeBase} onChange={e => setAiKnowledgeBase(e.target.value)} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, opacity: aiEnabled ? 1 : 0.5, pointerEvents: aiEnabled ? 'auto' : 'none' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Identidade do Assistente</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nome</label>
              <input className="form-input" placeholder="Ex: Ana — Suporte" value={aiPersonaName} onChange={e => setAiPersonaName(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">URL da Foto</label>
              <input className="form-input" placeholder="https://..." value={aiPersonaAvatar} onChange={e => setAiPersonaAvatar(e.target.value)} />
            </div>
          </div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Instrução Customizada (System Prompt)</div>
          <textarea className="form-input" rows={4} placeholder={`Você é assistente. Responda dúvidas baseadas na Base de Dados. Seja conciso.`} value={aiSystemPrompt} onChange={e => setAiSystemPrompt(e.target.value)} style={{ resize: 'vertical', fontSize: 13 }} />
        </div>

        {/* Sandbox Test Console Card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 20,
          opacity: aiEnabled ? 1 : 0.5,
          pointerEvents: aiEnabled ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>🧪 Sandbox de Testes da IA</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Teste o cérebro da sua IA em tempo real antes da live. Faça perguntas sobre preço, garantia ou suporte para ver como ela responderá aos seus alunos, mantendo o histórico de conversação.
            </div>
          </div>

          {/* Conversation history area */}
          <div style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            minHeight: 200,
            maxHeight: 320,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            {sandboxMessages.length === 0 ? (
              <div style={{
                margin: 'auto',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
                padding: '20px 0'
              }}>
                💬 Envie uma mensagem para iniciar o teste da IA...
              </div>
            ) : (
              sandboxMessages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 4
                }}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    marginLeft: msg.role === 'user' ? 0 : 4,
                    marginRight: msg.role === 'user' ? 4 : 0,
                  }}>
                    {msg.role === 'user' ? 'Você (Testador)' : (aiPersonaName || '🤖 Assistente')}
                  </div>
                  <div style={{
                    background: msg.role === 'user' ? 'var(--brand)' : 'var(--bg-elevated)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                    color: '#fff',
                    borderRadius: 12,
                    padding: '8px 12px',
                    fontSize: 13,
                    maxWidth: '85%',
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            
            {sandboxTyping && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 4 }}>
                  {aiPersonaName || '🤖 Assistente'}
                </div>
                <div style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                  digitando...
                </div>
              </div>
            )}
          </div>

          {/* Sandbox Controls */}
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="form-input"
              value={sandboxInput}
              onChange={e => setSandboxInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendSandboxMessage()
                }
              }}
              placeholder="Pergunte algo (Ex: Tem garantia?)"
              style={{ flex: 1 }}
              disabled={sandboxTyping}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={sendSandboxMessage}
              disabled={sandboxTyping || !sandboxInput.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Enviar 🚀
            </button>
            {sandboxMessages.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSandboxMessages([])}
                style={{ color: '#ef4444' }}
              >
                Limpar Histórico ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={showAiModal}
        onClose={() => { setShowAiModal(false); setAiDiff(null) }}
        title={aiDiff ? '✨ Geração Concluída — Revise o Resultado' : '✨ Gerador Mágico Simulação (IA)'}
        footer={
          aiDiff ? (
            <>
              <button className="btn btn-ghost" onClick={() => handleDiffConfirm(false)}>Revisar antes de salvar</button>
              <button className="btn btn-primary" onClick={() => handleDiffConfirm(true)}>💾 Salvar agora</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setShowAiModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleGenerateAi} disabled={aiGenerating}>
                {aiGenerating ? <><span className="spinner" style={{ marginRight: 6 }} />Gerando...</> : '🪄 Gerar Simulação'}
              </button>
            </>
          )
        }
      >
        {aiDiff ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6
            }}>
              ✅ A IA preencheu os campos abaixo com base no seu roteiro.
              Você pode <strong style={{ color: 'var(--text-primary)' }}>revisar e editar</strong> antes de salvar, ou salvar direto agora.
            </div>

            {([
              { icon: '👥', label: 'Nomes de participantes', items: aiDiff.names, color: '#6366f1' },
              { icon: '✨', label: 'Frases Mix (pool geral)', items: aiDiff.phrasesMix, color: '#8b5cf6' },
              { icon: '👏', label: 'Frases de Elogios', items: aiDiff.phrasesElogios, color: '#3b82f6' },
              { icon: '🔥', label: 'Frases de Engajamento', items: aiDiff.phrasesEngajamento, color: '#f59e0b' },
              { icon: '🎉', label: 'Frases "Garantiu a Vaga"', items: aiDiff.phrasesVaga, color: '#10b981' },
            ] as { icon: string; label: string; items: string[]; color: string }[])
              .filter(g => g.items.length > 0)
              .map(group => (
                <div key={group.label} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{group.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{group.label}</span>
                    <span style={{
                      marginLeft: 'auto', background: group.color + '22',
                      color: group.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    }}>{group.items.length} itens</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {group.items.slice(0, 8).map((item, i) => (
                      <span key={i} style={{
                        background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 20, padding: '3px 10px', fontSize: 12, color: 'var(--text-secondary)',
                      }}>{item}</span>
                    ))}
                    {group.items.length > 8 && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        +{group.items.length - 8} mais...
                      </span>
                    )}
                  </div>
                </div>
              ))
            }

            {aiDiff.segments.length > 0 && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Segmentos de tempo criados</span>
                  <span style={{
                    marginLeft: 'auto', background: '#6366f122', color: '#6366f1',
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  }}>{aiDiff.segments.length} segmentos</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {aiDiff.segments.map((seg, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', fontSize: 12,
                    }}>
                      <span style={{ fontWeight: 700, color: 'var(--brand-light)', minWidth: 110 }}>
                        {fmtSec(seg.from)} → {fmtSec(seg.to)}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{seg.cpm} msg/min</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 11, padding: '2px 10px',
                        borderRadius: 20, background: 'var(--bg-elevated)', color: 'var(--text-secondary)'
                      }}>
                        {seg.phrases === 'elogios' ? '👏 Elogios'
                          : seg.phrases === 'vaga' ? '🎉 Vaga'
                          : seg.phrases === 'engajamento' ? '🔥 Engajamento'
                          : '✨ Mix'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Cole abaixo o contexto, cronograma, oferta, tópicos ou roteiro oficial desse webinar.
              A inteligência artificial fará a leitura inteira da apresentação e vai <strong>preencher absolutamente todo o chat</strong> com as frases certas, nos segmentos certos e citar nomes e dores baseadas na oferta como se fossem pessoas reais.
            </div>
            <textarea
              className="form-input form-textarea"
              style={{ minHeight: 250, fontSize: 13, resize: 'vertical' }}
              placeholder={`Módulo 1 de Dieta (0 a 10 min): Quebrando crenças...\nMódulo 2 (10 a 25 min): Pergunta à plateia quem tem dificuldade...\nMódulo 3 (25 a fim): Promessa Master de Emagrecimento, perca 5kg...`}
              value={aiScriptText}
              onChange={e => setAiScriptText(e.target.value)}
              autoFocus
            />
          </>
        )}
      </Modal>
    </>
  )
}
