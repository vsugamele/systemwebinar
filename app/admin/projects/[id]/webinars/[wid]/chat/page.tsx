'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import type { ChatSegment } from '@/types'
import {
  CHAT_PHRASES_ELOGIOS,
  CHAT_PHRASES_VAGA,
  CHAT_PHRASES_ENGAJAMENTO,
  DEFAULT_NAMES,
} from '@/components/WebinarRoom'

const ALL_PHRASES = [...CHAT_PHRASES_ELOGIOS, ...CHAT_PHRASES_VAGA, ...CHAT_PHRASES_ENGAJAMENTO]

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

export default function ChatConfigPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()
  const [webinarName, setWebinarName] = useState('')

  // Segments state
  const [segments, setSegments] = useState<ChatSegment[]>([])
  const [useSegments, setUseSegments] = useState(false)

  // Global CPM state
  const [chatMode, setChatMode] = useState<'cpm' | 'interval'>('cpm')
  const [chatCpm, setChatCpm] = useState(0)
  const [chatIntervalMinutes, setChatIntervalMinutes] = useState(5)
  const [chatStartSeconds, setChatStartSeconds] = useState(0)
  const [chatEndSeconds, setChatEndSeconds] = useState<string>('')
  const [chatPhrasesRaw, setChatPhrasesRaw] = useState('')
  const [chatNamesRaw, setChatNamesRaw] = useState('')
  const [chatDefaultTab, setChatDefaultTab] = useState<'chat' | 'qa'>('chat')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('webi_webinars')
        .select('name, chat_cpm, chat_names, chat_default_tab, chat_mode, chat_interval_minutes, chat_start_seconds, chat_end_seconds, chat_phrases, chat_segments')
        .eq('id', webinarId)
        .single()
      if (data) {
        setWebinarName(data.name)
        setChatCpm(data.chat_cpm || 0)
        setChatMode((data.chat_mode as 'cpm' | 'interval') || 'cpm')
        setChatIntervalMinutes(data.chat_interval_minutes || 5)
        setChatStartSeconds(data.chat_start_seconds || 0)
        setChatEndSeconds(data.chat_end_seconds != null ? String(data.chat_end_seconds) : '')
        const names = data.chat_names as string[] | null
        if (Array.isArray(names) && names.length > 0) setChatNamesRaw(names.join('\n'))
        const phrases = data.chat_phrases as string[] | null
        if (Array.isArray(phrases) && phrases.length > 0) setChatPhrasesRaw(phrases.join('\n'))
        if (data.chat_default_tab === 'qa') setChatDefaultTab('qa')
        const segs = data.chat_segments as ChatSegment[] | null
        if (Array.isArray(segs) && segs.length > 0) {
          setSegments(segs)
          setUseSegments(true)
        }
      }
      setLoading(false)
    }
    load()
  }, [webinarId])

  async function save() {
    setSaving(true)
    const namesArray = chatNamesRaw.split('\n').map(n => n.trim()).filter(Boolean)
    const phrasesArray = chatPhrasesRaw.split('\n').map(p => p.trim()).filter(Boolean)
    const endSec = chatEndSeconds.trim() !== '' ? Number(chatEndSeconds) : null
    await supabase.from('webi_webinars').update({
      chat_cpm: chatMode === 'cpm' ? chatCpm : 0,
      chat_names: namesArray,
      chat_default_tab: chatDefaultTab,
      chat_mode: chatMode,
      chat_interval_minutes: chatIntervalMinutes,
      chat_start_seconds: chatStartSeconds,
      chat_end_seconds: endSec,
      chat_phrases: phrasesArray.length > 0 ? phrasesArray : null,
      chat_segments: useSegments && segments.length > 0 ? segments : null,
    }).eq('id', webinarId)
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

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">💬 Simulação do Chat</h1>
          <p className="page-subtitle">Configure a frequência de mensagens simuladas e os participantes fictícios do seu webinar</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="spinner" /> : '💾 Salvar'}
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['cpm', 'interval'] as const).map(m => (
              <button
                key={m}
                type="button"
                className={`btn btn-sm ${chatMode === m ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setChatMode(m)}
              >
                {m === 'cpm' ? '📊 CPM (msgs/min)' : '⏳ Intervalo (a cada N min)'}
              </button>
            ))}
          </div>

          {chatMode === 'cpm' ? (
            <>
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
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {[0, 2, 5, 10, 20, 30, 60, 120, 300].map(v => (
                  <button key={v}
                    className={`btn btn-sm ${chatCpm === v ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setChatCpm(v)}>
                    {v === 0 ? 'Desativado' : v < 60 ? `${v}/min` : `${v}/min (${v / 60}/s)`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>1 mensagem a cada</span>
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
                ≈ {(1 / chatIntervalMinutes).toFixed(2)} msg/min
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💬 Mensagens Simuladas (pool global)</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Usadas no modo global e nos segmentos com frases &quot;Todas (mix)&quot;. Uma mensagem por linha.
            Deixe vazio para usar as 60 frases padrão do sistema.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChatPhrasesRaw(CHAT_PHRASES_ELOGIOS.join('\n'))}>
              👏 Elogios ({CHAT_PHRASES_ELOGIOS.length})
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChatPhrasesRaw(CHAT_PHRASES_VAGA.join('\n'))}>
              🎉 Garantiu a Vaga ({CHAT_PHRASES_VAGA.length})
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChatPhrasesRaw(CHAT_PHRASES_ENGAJAMENTO.join('\n'))}>
              🔥 Engajamento ({CHAT_PHRASES_ENGAJAMENTO.length})
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChatPhrasesRaw(ALL_PHRASES.join('\n'))}>
              ✨ Todas ({ALL_PHRASES.length})
            </button>
            {chatPhrasesRaw && (
              <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--text-muted)' }} onClick={() => setChatPhrasesRaw('')}>
                ✕ Usar padrão
              </button>
            )}
          </div>
          <textarea
            className="form-input form-textarea"
            style={{ minHeight: 160, fontSize: 13 }}
            placeholder={`Incrível! Adorando o conteúdo 🔥\nJá garanti minha vaga! 🎉\n...`}
            value={chatPhrasesRaw}
            onChange={e => setChatPhrasesRaw(e.target.value)}
          />
          {chatPhrasesRaw && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {chatPhrasesRaw.split('\n').filter(Boolean).length} mensagens configuradas
            </div>
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
    </>
  )
}
