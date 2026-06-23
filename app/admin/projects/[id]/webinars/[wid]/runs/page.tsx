'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

interface WebinarRun {
  id: string
  title: string
  status: 'active' | 'ended' | 'cancelled'
  started_at: string
  ended_at: string | null
  metadata: Record<string, any>
}

function SessionScoreBadge({
  run,
  webinarId,
  supabase,
}: {
  run: WebinarRun
  webinarId: string
  supabase: any
}) {
  const [score, setScore] = useState<number | null>(run.metadata?.quality_score ?? null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (score !== null && run.status !== 'active') return

    setLoading(true)
    fetch(`/api/analytics?webinar_id=${webinarId}&run_id=${run.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.session_quality_score === 'number') {
          const s = data.session_quality_score
          setScore(s)
          
          // Cache the score in Supabase metadata if this run has ended and doesn't have it
          if (run.status === 'ended' && run.metadata?.quality_score === undefined) {
            const updatedMeta = { ...(run.metadata || {}), quality_score: s }
            supabase
              .from('webi_webinar_runs')
              .update({ metadata: updatedMeta })
              .eq('id', run.id)
              .then(({ error }: any) => {
                if (error) console.error('Erro ao salvar score em cache:', error)
              })
          }
        }
      })
      .catch((err) => console.error('Erro ao carregar score:', err))
      .finally(() => setLoading(false))
  }, [run.id, run.status, webinarId, supabase])

  if (loading && score === null) {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          width: 10,
          height: 10,
          border: '1.5px solid var(--border)',
          borderTopColor: 'var(--brand)',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 1s linear infinite'
        }} />
        Nota...
      </span>
    )
  }

  if (score === null) return null

  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const bg = score >= 80 ? 'rgba(16,185,129,0.1)' : score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 800,
        padding: '2px 8px',
        borderRadius: 8,
        background: bg,
        color: color,
        border: `1px solid ${color}30`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
      title={`Score de Qualidade: ${score}/100`}
    >
      ⭐ {score} pts
    </span>
  )
}

export default function WebinarRunsPage() {
  const { id: projectId, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState<WebinarRun[]>([])
  const [webinarName, setWebinarName] = useState('')
  const [runningId, setRunningId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [runTitle, setRunTitle] = useState('')

  async function loadData() {
    try {
      const { data: w } = await supabase.from('webi_webinars').select('name, current_run_id').eq('id', wid).single()
      if (w) {
        setWebinarName(w.name)
        setRunningId(w.current_run_id)
      }

      const { data: list } = await supabase
        .from('webi_webinar_runs')
        .select('*')
        .eq('webinar_id', wid)
        .order('started_at', { ascending: false })

      if (list) {
        setRuns(list as WebinarRun[])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [wid, supabase])

  async function startRun(e: React.FormEvent) {
    e.preventDefault()
    setActionLoading(true)

    try {
      const res = await fetch('/api/webinar-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webinar_id: wid,
          action: 'start',
          title: runTitle || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar')

      toast.success('Execução iniciada!')
      setRunTitle('')
      loadData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function stopRun(runId: string) {
    if (!confirm('Deseja encerrar esta execução ativa? Alunos conectados deixarão de ver a transmissão ao vivo.')) return
    setActionLoading(true)

    try {
      const res = await fetch('/api/webinar-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webinar_id: wid,
          action: 'stop',
          run_id: runId,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao parar')

      toast.success('Execução encerrada.')
      loadData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const activeRun = runs.find(r => r.status === 'active')

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      <Toaster position="top-right" />

      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
            {' / '}{webinarName}
          </div>
          <h1 className="page-title">⏱️ Histórico de Execuções (Runs)</h1>
          <p className="page-subtitle">Acompanhe as transmissões realizadas do webinar e gerencie a execução ativa.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Run list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            Histórico de Sessões
          </div>

          {runs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhuma execução registrada para este webinar.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {runs.map(run => {
                const isActive = run.status === 'active'
                return (
                  <div
                    key={run.id}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${isActive ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{run.title || 'Sem título'}</strong>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 99,
                            background: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                            color: isActive ? '#10b981' : 'var(--text-muted)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {isActive ? 'Ativo' : 'Finalizado'}
                        </span>
                        <SessionScoreBadge run={run} webinarId={wid} supabase={supabase} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Início: {new Date(run.started_at).toLocaleString('pt-BR')}
                        {run.ended_at && ` | Fim: ${new Date(run.ended_at).toLocaleString('pt-BR')}`}
                      </div>
                    </div>

                    {isActive && (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={actionLoading}
                        onClick={() => stopRun(run.id)}
                      >
                        🛑 Encerrar
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Quick Trigger Run */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeRun ? (
            <div className="card" style={{ border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.02)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                Sessão em Andamento
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Uma execução está ativa neste momento. Seus alunos podem entrar na sala ao vivo.
              </p>
              <div style={{ fontSize: 12 }}>
                Título: <b>{activeRun.title}</b>
              </div>
              <button
                className="btn btn-danger"
                style={{ width: '100%', padding: '10px' }}
                disabled={actionLoading}
                onClick={() => stopRun(activeRun.id)}
              >
                Encerrar Transmissão
              </button>
            </div>
          ) : (
            <div className="card">
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>🚀 Iniciar Nova Execução</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
                Ao iniciar uma nova execução, o contador de tempo de live é resetado e as métricas do chat e retenção serão agregadas a esta nova run.
              </p>
              <form onSubmit={startRun} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Identificador / Título da Run</label>
                  <input
                    type="text"
                    className="form-input"
                    value={runTitle}
                    onChange={e => setRunTitle(e.target.value)}
                    placeholder="Ex: Turma de Terça 20h..."
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={actionLoading}>
                  {actionLoading ? '⏳ Iniciando...' : '🔥 Iniciar Transmissão'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
