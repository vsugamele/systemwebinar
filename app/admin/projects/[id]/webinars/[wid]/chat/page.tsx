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
  const [activePoolTab, setActivePoolTab] = useState<'mix' | 'elogios' | 'vaga' | 'engajamento'>('mix')
  const [chatPhrasesRaw, setChatPhrasesRaw] = useState('')
  const [chatPhrasesElogiosRaw, setChatPhrasesElogiosRaw] = useState('')
  const [chatPhrasesVagaRaw, setChatPhrasesVagaRaw] = useState('')
  const [chatPhrasesEngajamentoRaw, setChatPhrasesEngajamentoRaw] = useState('')
  const [chatNamesRaw, setChatNamesRaw] = useState('')
  const [chatDefaultTab, setChatDefaultTab] = useState<'chat' | 'qa'>('chat')
  const [badWordsFilter, setBadWordsFilter] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

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
      if (json.phrasesMix?.length) setChatPhrasesRaw(json.phrasesMix.join('\n'))
      if (json.phrasesElogios?.length) setChatPhrasesElogiosRaw(json.phrasesElogios.join('\n'))
      if (json.phrasesEngajamento?.length) setChatPhrasesEngajamentoRaw(json.phrasesEngajamento.join('\n'))
      if (json.phrasesVaga?.length) setChatPhrasesVagaRaw(json.phrasesVaga.join('\n'))
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
          .select('name, chat_cpm, chat_names, chat_default_tab, chat_mode, chat_interval_minutes, chat_interval_messages, chat_start_seconds, chat_end_seconds, chat_phrases, chat_phrases_elogios, chat_phrases_vaga, chat_phrases_engajamento, chat_segments, ai_enabled, ai_model, ai_knowledge_base, ai_system_prompt, ai_persona_name, ai_persona_avatar, bad_words_filter')
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
        if (Array.isArray(phrases) && phrases.length > 0) setChatPhrasesRaw(phrases.join('\n'))

        const phrasesElogios = (data as any).chat_phrases_elogios as string[] | null
        if (Array.isArray(phrasesElogios) && phrasesElogios.length > 0) setChatPhrasesElogiosRaw(phrasesElogios.join('\n'))
        
        const phrasesVaga = (data as any).chat_phrases_vaga as string[] | null
        if (Array.isArray(phrasesVaga) && phrasesVaga.length > 0) setChatPhrasesVagaRaw(phrasesVaga.join('\n'))
        
        const phrasesEngajamento = (data as any).chat_phrases_engajamento as string[] | null
        if (Array.isArray(phrasesEngajamento) && phrasesEngajamento.length > 0) setChatPhrasesEngajamentoRaw(phrasesEngajamento.join('\n'))

        if (data.chat_default_tab === 'qa') setChatDefaultTab('qa')
        const segs = data.chat_segments as ChatSegment[] | null
        if (Array.isArray(segs) && segs.length > 0) {
          setSegments(segs)
          setUseSegments(true)
        }
        setBadWordsFilter(data.bad_words_filter || false)
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
    const phrasesArray = chatPhrasesRaw.split('\n').map(p => p.trim()).filter(Boolean)
    const elogiosArray = chatPhrasesElogiosRaw.split('\n').map(p => p.trim()).filter(Boolean)
    const vagaArray = chatPhrasesVagaRaw.split('\n').map(p => p.trim()).filter(Boolean)
    const engajamentoArray = chatPhrasesEngajamentoRaw.split('\n').map(p => p.trim()).filter(Boolean)
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
        chat_phrases: phrasesArray.length > 0 ? phrasesArray : null,
        chat_phrases_elogios: elogiosArray.length > 0 ? elogiosArray : null,
        chat_phrases_vaga: vagaArray.length > 0 ? vagaArray : null,
        chat_phrases_engajamento: engajamentoArray.length > 0 ? engajamentoArray : null,
        chat_segments: useSegments && segments.length > 0 ? segments : null,
        ai_enabled: aiEnabled,
        ai_model: aiModel,
        ai_knowledge_base: aiKnowledgeBase,
        ai_system_prompt: aiSystemPrompt,
        ai_persona_name: aiPersonaName,
        ai_persona_avatar: aiPersonaAvatar,
        bad_words_filter: badWordsFilter,
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
  const diagMixCount = chatPhrasesRaw.split('\n').filter(l => l.trim()).length
  const diagElogiosCount = chatPhrasesElogiosRaw.split('\n').filter(l => l.trim()).length
  const diagVagaCount = chatPhrasesVagaRaw.split('\n').filter(l => l.trim()).length
  const diagEngCount = chatPhrasesEngajamentoRaw.split('\n').filter(l => l.trim()).length
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

          {useSegments && (
            <>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '90px 90px 80px 1fr 36px',
                gap: 8, marginBottom: 6,
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                paddingBottom: 6, borderBottom: '1px solid var(--border)',
              }}>
                <span>De (seg)</span>
                <span>Até (seg)</span>
                <span>CPM</span>
                <span>Frases</span>
                <span />
              </div>

              {segments.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
                  Nenhum segmento ainda. Clique em &quot;+ Adicionar&quot; para começar.
                </div>
              )}

              {segments.map((seg, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '90px 90px 80px 1fr 36px',
                  gap: 8, marginBottom: 8, alignItems: 'center',
                }}>
                  <input
                    type="number" min={0}
                    className="form-input"
                    style={{ fontSize: 13 }}
                    value={seg.from}
                    onChange={e => updateSegment(idx, { from: Number(e.target.value) })}
                    placeholder="0"
                  />
                  <input
                    type="number" min={0}
                    className="form-input"
                    style={{ fontSize: 13 }}
                    value={seg.to ?? ''}
                    onChange={e => updateSegment(idx, { to: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="fim"
                  />
                  <input
                    type="number" min={0} max={300}
                    className="form-input"
                    style={{ fontSize: 13 }}
                    value={seg.cpm}
                    onChange={e => updateSegment(idx, { cpm: Number(e.target.value) })}
                  />
                  <select
                    className="form-input form-select"
                    style={{ fontSize: 13 }}
                    value={seg.phrases ?? ''}
                    onChange={e => updateSegment(idx, {
                      phrases: e.target.value === '' ? null : e.target.value as ChatSegment['phrases']
                    })}
                  >
                    {PHRASE_OPTIONS.map(opt => (
                      <option key={String(opt.value)} value={opt.value ?? ''}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--text-muted)', padding: '0 8px' }}
                    onClick={() => removeSegment(idx)}
                  >
                    🗑
                  </button>
                </div>
              ))}

              {/* Summary */}
              {segments.length > 0 && (
                <div style={{
                  fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 10,
                  background: 'var(--bg)', borderRadius: 6, padding: '6px 10px',
                }}>
                  {segments.map((s, i) => (
                    <span key={i}>
                      {i > 0 && <span style={{ margin: '0 6px', opacity: 0.4 }}>→</span>}
                      <span style={{ color: s.cpm > 0 ? 'var(--brand-light)' : 'var(--text-muted)' }}>
                        {fmtSec(s.from)}–{fmtSec(s.to)} ({s.cpm} cpm)
                      </span>
                    </span>
                  ))}
                </div>
              )}

              <button type="button" className="btn btn-ghost btn-sm" onClick={addSegment}>
                + Adicionar Segmento
              </button>
            </>
          )}

          {!useSegments && segments.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {segments.length} segmento(s) salvos, mas desativados. Ative para usar.
            </div>
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
            <button type="button" className={`btn btn-sm ${(chatCpm !== 2 && chatCpm !== 8 && chatCpm !== 15) || chatMode === 'interval' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setChatMode('cpm'); setChatCpm(0); }}>⚙️ Personalizado</button>
            
            {((chatCpm !== 2 && chatCpm !== 8 && chatCpm !== 15) || chatMode === 'interval') && (
              <select className="form-input" style={{ width: 180, padding: '6px 10px', fontSize: 13 }} value={chatMode} onChange={e => setChatMode(e.target.value as any)}>
                <option value="cpm">Acompanhar via CPM (Msgs/Minuto)</option>
                <option value="interval">Acompanhar via Intervalo (Por msgs)</option>
              </select>
            )}
          </div>

          {chatMode === 'cpm' ? (
            <>
              {(chatCpm !== 2 && chatCpm !== 8 && chatCpm !== 15) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <input
                    type="range" min={0} max={300} step={1}
                    value={chatCpm}
                    onChange={e => setChatCpm(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--brand)' }}
                  />
                  <div style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 16px', minWidth: 80, textAlign: 'center'
                  }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: chatCpm > 0 ? 'var(--brand-light)' : 'var(--text-muted)' }}>
                      {chatCpm}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>msg/min</div>
                    {chatCpm > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
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
              )}
            </>

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
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="form-label" style={{ marginBottom: 4, display: 'block' }}>Início (segundos)</label>
              <input
                type="number" min={0}
                className="form-input"
                style={{ width: 140 }}
                value={chatStartSeconds}
                onChange={e => setChatStartSeconds(Number(e.target.value))}
                placeholder="0"
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {chatStartSeconds > 0 ? `${Math.floor(chatStartSeconds / 60)}m ${chatStartSeconds % 60}s` : 'Desde o início'}
              </div>
            </div>
            <div style={{ fontSize: 18, color: 'var(--text-muted)', paddingBottom: 24 }}>→</div>
            <div>
              <label className="form-label" style={{ marginBottom: 4, display: 'block' }}>Fim (segundos)</label>
              <input
                type="number" min={0}
                className="form-input"
                style={{ width: 140 }}
                value={chatEndSeconds}
                onChange={e => setChatEndSeconds(e.target.value)}
                placeholder="Até o fim"
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {chatEndSeconds
                  ? `${Math.floor(Number(chatEndSeconds) / 60)}m ${Number(chatEndSeconds) % 60}s`
                  : 'Até o fim do vídeo'}
              </div>
            </div>
          </div>
        </div>

        {/* ---- PHRASES ---- */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💬 Mensagens Simuladas (Pools)</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Personalize as frases que os simuladores enviaram. Cada tipo de mensagem pode ter o seu próprio pool para ser usado nos segmentos específicos. Uma mensagem por linha. Se deixar vazio, o sistema usa as frases padrão.
          </div>

          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 16, display: 'flex', gap: 16 }}>
            {[
              { id: 'mix', label: '✨ Todas (Mix)', count: chatPhrasesRaw ? chatPhrasesRaw.split('\n').filter(Boolean).length : ALL_PHRASES.length },
              { id: 'elogios', label: '👏 Elogios', count: chatPhrasesElogiosRaw ? chatPhrasesElogiosRaw.split('\n').filter(Boolean).length : CHAT_PHRASES_ELOGIOS.length },
              { id: 'vaga', label: '🎉 Garantiu a Vaga', count: chatPhrasesVagaRaw ? chatPhrasesVagaRaw.split('\n').filter(Boolean).length : CHAT_PHRASES_VAGA.length },
              { id: 'engajamento', label: '🔥 Engajamento', count: chatPhrasesEngajamentoRaw ? chatPhrasesEngajamentoRaw.split('\n').filter(Boolean).length : CHAT_PHRASES_ENGAJAMENTO.length },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePoolTab(tab.id as any)}
                style={{
                  padding: '8px 4px', fontSize: 13, fontWeight: 600,
                  borderBottom: `2px solid ${activePoolTab === tab.id ? 'var(--brand)' : 'transparent'}`,
                  color: activePoolTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {activePoolTab === 'mix' && (
            <>
              <textarea
                className="form-input form-textarea"
                style={{ minHeight: 160, fontSize: 13 }}
                placeholder={`Incrível! Adorando o conteúdo 🔥\nJá garanti minha vaga! 🎉\n...`}
                value={chatPhrasesRaw}
                onChange={e => setChatPhrasesRaw(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Usadas no modo Global ou nos segmentos "Todas (mix)".
                </div>
                {chatPhrasesRaw && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ padding: 0, color: '#ef4444' }} onClick={() => setChatPhrasesRaw('')}>
                    Limpar e usar padrão
                  </button>
                )}
              </div>
            </>
          )}

          {activePoolTab === 'elogios' && (
            <>
              <textarea
                className="form-input form-textarea"
                style={{ minHeight: 160, fontSize: 13 }}
                placeholder={`Muito bom!\nExcelente didática!\n...`}
                value={chatPhrasesElogiosRaw}
                onChange={e => setChatPhrasesElogiosRaw(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Usadas em segmentos do tipo "Elogios".</div>
                {chatPhrasesElogiosRaw && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ padding: 0, color: '#ef4444' }} onClick={() => setChatPhrasesElogiosRaw('')}>
                    Limpar e usar padrão
                  </button>
                )}
              </div>
            </>
          )}

          {activePoolTab === 'vaga' && (
            <>
              <textarea
                className="form-input form-textarea"
                style={{ minHeight: 160, fontSize: 13 }}
                placeholder={`Estou dentro!\nComprado!\n...`}
                value={chatPhrasesVagaRaw}
                onChange={e => setChatPhrasesVagaRaw(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Usadas em segmentos do tipo "Garantiu a Vaga".</div>
                {chatPhrasesVagaRaw && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ padding: 0, color: '#ef4444' }} onClick={() => setChatPhrasesVagaRaw('')}>
                    Limpar e usar padrão
                  </button>
                )}
              </div>
            </>
          )}

          {activePoolTab === 'engajamento' && (
            <>
              <textarea
                className="form-input form-textarea"
                style={{ minHeight: 160, fontSize: 13 }}
                placeholder={`Eu quero!\nSim!\n...`}
                value={chatPhrasesEngajamentoRaw}
                onChange={e => setChatPhrasesEngajamentoRaw(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Usadas em segmentos do tipo "Engajamento".</div>
                {chatPhrasesEngajamentoRaw && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ padding: 0, color: '#ef4444' }} onClick={() => setChatPhrasesEngajamentoRaw('')}>
                    Limpar e usar padrão
                  </button>
                )}
              </div>
            </>
          )}

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
                    ...(chatPhrasesRaw ? chatPhrasesRaw.split('\n').filter(Boolean) : []),
                    ...(chatPhrasesElogiosRaw ? chatPhrasesElogiosRaw.split('\n').filter(Boolean) : CHAT_PHRASES_ELOGIOS),
                    ...(chatPhrasesEngajamentoRaw ? chatPhrasesEngajamentoRaw.split('\n').filter(Boolean) : CHAT_PHRASES_ENGAJAMENTO),
                    ...(chatPhrasesVagaRaw ? chatPhrasesVagaRaw.split('\n').filter(Boolean) : CHAT_PHRASES_VAGA),
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
            <strong style={{ color: 'var(--text-primary)' }}>Broadcast de Vendas:</strong>{' '}
            Quando um evento <strong>Pitch Button</strong> disparar, mensagens &quot;{'{nome}'} acabou de comprar!&quot; aparecerão
            automaticamente usando os nomes cadastrados acima.
          </div>
        </div>
      </div>

      {/* ---- AI CONFIG TAB ---- */}
      <div className="page-body" style={{ display: activeTab === 'ia' ? 'flex' : 'none', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Ativar IA no Chat</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Muitas mensagens? A IA pode detectar perguntas e responder automaticamente no chat.</div>
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
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Base de Conhecimento</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>O produto, preços, detalhes, FAQ. Use isso para balizar a resposta.</div>
          <textarea className="form-input" rows={8} placeholder="Ex: PRODUTO: Curso X, PREÇO: R$ 500, ACESSO: Imediato..." value={aiKnowledgeBase} onChange={e => setAiKnowledgeBase(e.target.value)} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
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
