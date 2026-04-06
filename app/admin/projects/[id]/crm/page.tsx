'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface ChatRow {
  id: string
  author: string
  text: string
  timestamp_video: number
  created_at: string
  webinar_id: string
  webinar_name?: string
}

interface Webinar {
  id: string
  name: string
}

function formatVideoTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function autoTag(text: string): { emoji: string; label: string; color: string } {
  const t = text.toLowerCase()
  if (t.includes('?')) return { emoji: '🟡', label: 'Dúvida', color: '#fbbf24' }
  if (/ótimo|ótima|incrível|parabéns|amei|adorei|excelente|perfeito|top|show|maravilh/.test(t))
    return { emoji: '🟢', label: 'Elogio', color: '#22c55e' }
  if (/ruim|péssim|problema|não entendi|nao entendi|travando|trava|bug|erro|horrível/.test(t))
    return { emoji: '🔴', label: 'Reclamação', color: '#ef4444' }
  return { emoji: '⚪', label: 'Comentário', color: '#6b7280' }
}

export default function CrmPage() {
  const { id } = useParams() as { id: string }
  const supabase = createClient()

  const [messages, setMessages] = useState<ChatRow[]>([])
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [loading, setLoading] = useState(true)
  const [filterWebinar, setFilterWebinar] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      // Load webinars for this project
      const { data: wbs } = await supabase
        .from('webi_webinars')
        .select('id, name')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
      setWebinars(wbs || [])

      if (!wbs?.length) { setLoading(false); return }

      const webinarIds = wbs.map(w => w.id)

      // Load real (non-simulated) chat messages
      const { data: msgs } = await supabase
        .from('webi_live_chat')
        .select('id, author, text, timestamp_video, created_at, webinar_id')
        .eq('is_simulated', false)
        .eq('is_broadcast', false)
        .in('webinar_id', webinarIds)
        .order('created_at', { ascending: false })
        .limit(1000)

      // Join webinar names manually
      const nameMap = Object.fromEntries(wbs.map(w => [w.id, w.name]))
      setMessages((msgs || []).map(m => ({ ...m, webinar_name: nameMap[m.webinar_id] })))
      setLoading(false)
    }
    load()
  }, [id])

  const filtered = useMemo(() => {
    return messages.filter(m => {
      if (filterWebinar && m.webinar_id !== filterWebinar) return false
      if (search && !m.text.toLowerCase().includes(search.toLowerCase()) && !m.author.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [messages, filterWebinar, search])

  // Aggregate stats
  const stats = useMemo(() => {
    const counts = { duvida: 0, elogio: 0, reclamacao: 0, comentario: 0 }
    filtered.forEach(m => {
      const tag = autoTag(m.text).label
      if (tag === 'Dúvida') counts.duvida++
      else if (tag === 'Elogio') counts.elogio++
      else if (tag === 'Reclamação') counts.reclamacao++
      else counts.comentario++
    })
    return counts
  }, [filtered])

  function exportCSV() {
    const rows = [
      ['Autor', 'Mensagem', 'Tag', 'Webinar', 'Horário', 'Tempo Vídeo'],
      ...filtered.map(m => [
        m.author,
        `"${m.text.replace(/"/g, '""')}"`,
        autoTag(m.text).label,
        m.webinar_name || '',
        new Date(m.created_at).toLocaleString('pt-BR'),
        formatVideoTime(m.timestamp_video),
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crm-mensagens-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Projeto</Link>
          </div>
          <h1 className="page-title">💬 CRM de Mensagens</h1>
          <p className="page-subtitle">Mensagens reais dos leads — o que estão buscando, dúvidas, elogios e reclamações</p>
        </div>
        <button className="btn btn-ghost" onClick={exportCSV} disabled={filtered.length === 0}>
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { label: 'Total', value: filtered.length, color: 'var(--brand)', bg: 'rgba(99,102,241,0.1)' },
            { label: '🟡 Dúvidas', value: stats.duvida, color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
            { label: '🟢 Elogios', value: stats.elogio, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
            { label: '🔴 Reclamações', value: stats.reclamacao, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
            { label: '⚪ Comentários', value: stats.comentario, color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, border: `1px solid ${s.color}33`,
              borderRadius: 12, padding: '10px 18px', minWidth: 100,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            className="form-input"
            value={filterWebinar}
            onChange={e => setFilterWebinar(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">Todos os webinars</option>
            {webinars.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <input
            className="form-input"
            placeholder="Buscar mensagem ou autor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>

        {/* Messages */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <div className="empty-title">Nenhuma mensagem encontrada</div>
            <div className="empty-desc">
              {messages.length === 0
                ? 'Os leads ainda não enviaram mensagens reais nos webinars deste projeto.'
                : 'Tente ajustar os filtros.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(m => {
              const tag = autoTag(m.text)
              return (
                <div key={m.id} className="card" style={{ padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {/* Tag */}
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: `${tag.color}18`, border: `1px solid ${tag.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                  }}>
                    {tag.emoji}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{m.author}</span>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 99,
                        background: `${tag.color}18`, color: tag.color, fontWeight: 600,
                      }}>{tag.label}</span>
                      {m.webinar_name && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          📺 {m.webinar_name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {m.text}
                    </div>
                  </div>

                  {/* Meta */}
                  <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                    <div>{new Date(m.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                    <div style={{ fontFamily: 'monospace' }}>⏱ {formatVideoTime(m.timestamp_video)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
