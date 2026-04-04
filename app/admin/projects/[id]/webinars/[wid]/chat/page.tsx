'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  CHAT_PHRASES_ELOGIOS,
  CHAT_PHRASES_VAGA,
  CHAT_PHRASES_ENGAJAMENTO,
  DEFAULT_NAMES,
} from '@/components/WebinarRoom'

const ALL_PHRASES = [...CHAT_PHRASES_ELOGIOS, ...CHAT_PHRASES_VAGA, ...CHAT_PHRASES_ENGAJAMENTO]

export default function ChatConfigPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()
  const [webinarName, setWebinarName] = useState('')
  const [chatMode, setChatMode] = useState<'cpm' | 'interval'>('cpm')
  const [chatCpm, setChatCpm] = useState(0)
  const [chatIntervalMinutes, setChatIntervalMinutes] = useState(5)
  const [chatStartSeconds, setChatStartSeconds] = useState(0)
  const [chatEndSeconds, setChatEndSeconds] = useState<string>('')
  const [chatPhrasesRaw, setChatPhrasesRaw] = useState('')
  const [chatNamesRaw, setChatNamesRaw] = useState('')
  const [chatDefaultTab, setChatDefaultTab] = useState<'chat' | 'qa'>('chat')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('webi_webinars')
        .select('name, chat_cpm, chat_names, chat_default_tab, chat_mode, chat_interval_minutes, chat_start_seconds, chat_end_seconds, chat_phrases')
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
    }).eq('id', webinarId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
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
          {saving ? <span className="spinner" /> : saved ? '✅ Salvo!' : '💾 Salvar'}
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Frequency mode */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⏱ Frequência de Mensagens</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Escolha como as mensagens simuladas serão disparadas.
            Use <strong style={{ color: 'var(--text-primary)' }}>0 / desativado</strong> para usar apenas eventos da timeline.
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
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>
                      ENXURRADA
                    </div>
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
              {chatCpm >= 60 && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', fontSize: 12,
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 8, color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                  <strong style={{ color: '#f59e0b' }}>Modo Enxurrada ativo.</strong>{' '}
                  Com {chatCpm} CPM, uma mensagem a cada{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{Math.round((60 / chatCpm) * 1000)}ms</strong>.
                  {' '}Use um pool de nomes variado para evitar repetição.
                </div>
              )}
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

        {/* Time window */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🪟 Janela de Exibição</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Defina em que momento do vídeo a simulação começa e termina. Deixe o fim vazio para rodar até o final.
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
                {chatStartSeconds > 0
                  ? `${Math.floor(chatStartSeconds / 60)}m ${chatStartSeconds % 60}s`
                  : 'Desde o início'}
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

        {/* Phrase templates */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💬 Mensagens Simuladas</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Uma mensagem por linha. Deixe vazio para usar as mensagens padrão do sistema (60 frases variadas).
            Use os presets abaixo para preencher rapidamente.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setChatPhrasesRaw(CHAT_PHRASES_ELOGIOS.join('\n'))}
            >
              👏 Elogios ({CHAT_PHRASES_ELOGIOS.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setChatPhrasesRaw(CHAT_PHRASES_VAGA.join('\n'))}
            >
              🎉 Garantiu a Vaga ({CHAT_PHRASES_VAGA.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setChatPhrasesRaw(CHAT_PHRASES_ENGAJAMENTO.join('\n'))}
            >
              🔥 Engajamento ({CHAT_PHRASES_ENGAJAMENTO.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setChatPhrasesRaw(ALL_PHRASES.join('\n'))}
            >
              ✨ Todas ({ALL_PHRASES.length})
            </button>
            {chatPhrasesRaw && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setChatPhrasesRaw('')}
              >
                ✕ Usar padrão
              </button>
            )}
          </div>
          <textarea
            className="form-input form-textarea"
            style={{ minHeight: 180, fontSize: 13 }}
            placeholder={`Incrível! Adorando o conteúdo 🔥\nJá garanti minha vaga! 🎉\nQue dica incrível, aplicando agora mesmo!\n...`}
            value={chatPhrasesRaw}
            onChange={e => setChatPhrasesRaw(e.target.value)}
          />
          {chatPhrasesRaw && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {chatPhrasesRaw.split('\n').filter(Boolean).length} mensagens configuradas
            </div>
          )}
        </div>

        {/* Participant names pool */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👥 Pool de Participantes Fictícios</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Um por linha. Esses nomes serão usados tanto na simulação do chat quanto nas mensagens de compra quando o Pitch Button aparecer.
            Deixe vazio para usar os 200 nomes brasileiros padrão.
          </div>
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setChatNamesRaw(DEFAULT_NAMES.join('\n'))}
            >
              👥 Preencher com {DEFAULT_NAMES.length} nomes padrão
            </button>
            {chatNamesRaw && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ marginLeft: 8, color: 'var(--text-muted)' }}
                onClick={() => setChatNamesRaw('')}
              >
                ✕ Usar padrão
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                Nomes (um por linha) — {namesArray.length > 0 ? `${namesArray.length} cadastrados` : `usando ${DEFAULT_NAMES.length} padrão`}
              </label>
              <textarea
                className="form-input form-textarea"
                style={{ minHeight: 200, fontSize: 13 }}
                placeholder={DEFAULT_NAMES.slice(0, 8).join('\n')}
                value={chatNamesRaw}
                onChange={e => setChatNamesRaw(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Exemplo de mensagens de compra</label>
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

        {/* Default tab */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📌 Aba Padrão do Chat</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Qual aba estará ativa quando o participante entrar na sala.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['chat', 'qa'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                className={`btn btn-sm ${chatDefaultTab === tab ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setChatDefaultTab(tab)}
              >
                {tab === 'chat' ? '💬 Chat' : '❓ Q&A only'}
              </button>
            ))}
          </div>
        </div>

        {/* Info about how broadcast works */}
        <div style={{
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12
        }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Como funciona o Broadcast de Vendas:</strong><br />
            Quando um evento <strong>Pitch Button</strong> disparar na sala, se o campo
            <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4, margin: '0 4px' }}>broadcast_sales</code>
            estiver ativado, mensagens &quot;{'{nome}'} acabou de comprar!&quot; aparecerão automaticamente no chat a cada ~15s usando os nomes cadastrados acima.
          </div>
        </div>
      </div>
    </>
  )
}
