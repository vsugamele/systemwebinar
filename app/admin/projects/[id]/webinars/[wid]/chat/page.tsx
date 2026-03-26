'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const PURCHASE_EXAMPLES = [
  'João P. acabou de garantir uma vaga! 🎉',
  'Maria S. acabou de se inscrever 🔥',
  'Carlos M. acabou de comprar! ✅',
  'Ana L. garantiu a última vaga disponível 🚀',
]

export default function ChatConfigPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()
  const [webinarName, setWebinarName] = useState('')
  const [chatCpm, setChatCpm] = useState(0)
  const [chatNamesRaw, setChatNamesRaw] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('webi_webinars')
        .select('name, chat_cpm, chat_names')
        .eq('id', webinarId)
        .single()
      if (data) {
        setWebinarName(data.name)
        setChatCpm(data.chat_cpm || 0)
        const names = data.chat_names as string[] | null
        if (Array.isArray(names) && names.length > 0) {
          setChatNamesRaw(names.join('\n'))
        }
      }
      setLoading(false)
    }
    load()
  }, [webinarId])

  async function save() {
    setSaving(true)
    const namesArray = chatNamesRaw.split('\n').map(n => n.trim()).filter(Boolean)
    await supabase.from('webi_webinars').update({
      chat_cpm: chatCpm,
      chat_names: namesArray,
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
        {/* CPM Config */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⏱ Frequência de Mensagens (CPM)</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Defina quantas mensagens de chat simuladas aparecem por minuto, de forma automática e aleatória.
            Use <strong style={{ color: 'var(--text-primary)' }}>0</strong> para desativar e usar apenas os eventos da timeline.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <input
              type="range" min={0} max={30} step={1}
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
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[0, 2, 5, 10, 20].map(v => (
              <button key={v}
                className={`btn btn-sm ${chatCpm === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setChatCpm(v)}>
                {v === 0 ? 'Desativado' : `${v}/min`}
              </button>
            ))}
          </div>
        </div>

        {/* Participant names pool */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👥 Pool de Participantes Fictícios</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Um por linha. Esses nomes serão usados tanto na simulação do chat quanto nas mensagens de compra quando o Pitch Button aparecer.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                Nomes (um por linha) — {namesArray.length} cadastrados
              </label>
              <textarea
                className="form-input form-textarea"
                style={{ minHeight: 200, fontSize: 13 }}
                placeholder={`Maria Oliveira\nJoão Santos\nAna Costa\nCarlos Mendes\nLuciana Pereira\nRodrigo Lima\nFernanda Alves\nPedro Souza`}
                value={chatNamesRaw}
                onChange={e => setChatNamesRaw(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Exemplo de mensagens de compra</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(namesArray.length > 0 ? namesArray.slice(0, 4) : ['Maria', 'João', 'Ana', 'Carlos']).map((name, i) => (
                  <div key={i} style={{
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 8, padding: '10px 14px', fontSize: 13
                  }}>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>🛒 {name.split(' ')[0]}</span>
                    <span style={{ color: 'var(--text-secondary)' }}> acabou de garantir sua vaga! 🎉</span>
                  </div>
                ))}
                {namesArray.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    ↑ Cadastre nomes para ver o preview
                  </div>
                )}
              </div>
            </div>
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
            estiver ativado, mensagens "{'{nome}'} acabou de comprar!" aparecerão automaticamente no chat a cada ~15s usando os nomes cadastrados acima.
          </div>
        </div>
      </div>
    </>
  )
}
