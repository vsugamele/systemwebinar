'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Question {
  id: string
  webinar_id: string
  question: string
  options: string[]
  correct_index: number
  sort_order: number
  created_at: string
}

interface QuizResponse {
  id: string
  webinar_id: string
  lead_email: string
  lead_name: string
  answers: number[]
  score: number
  total: number
  completed_at: string
}

export default function QuizAdminPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()

  const [questions, setQuestions] = useState<Question[]>([])
  const [responses, setResponses] = useState<QuizResponse[]>([])
  const [webinarName, setWebinarName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Question | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'questions' | 'responses'>('questions')
  const [form, setForm] = useState({
    question: '',
    options: ['', '', '', ''],
    correct_index: 0,
    sort_order: 0,
  })
  const [hasQuiz, setHasQuiz] = useState(false)
  const [togglingQuiz, setTogglingQuiz] = useState(false)

  async function load() {
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('name, has_quiz')
      .eq('id', webinarId)
      .single()
    setWebinarName(webinar?.name || '')
    setHasQuiz(!!(webinar as Record<string, unknown> | null)?.has_quiz)

    const { data: qs } = await supabase
      .from('webi_quiz_questions')
      .select('*')
      .eq('webinar_id', webinarId)
      .order('sort_order')
    setQuestions(qs || [])

    const { data: rs } = await supabase
      .from('webi_quiz_responses')
      .select('*')
      .eq('webinar_id', webinarId)
      .order('completed_at', { ascending: false })
      .limit(100)
    setResponses(rs || [])

    setLoading(false)
  }

  useEffect(() => {
    supabase.from('webi_webinars').select('name, has_quiz').eq('id', webinarId).single()
      .then(({ data: webinar }) => {
        setWebinarName(webinar?.name || '')
        setHasQuiz(!!(webinar as Record<string, unknown> | null)?.has_quiz)
      })
    supabase.from('webi_quiz_questions').select('*').eq('webinar_id', webinarId).order('sort_order')
      .then(({ data: qs }) => setQuestions(qs || []))
    supabase.from('webi_quiz_responses').select('*').eq('webinar_id', webinarId).order('completed_at', { ascending: false }).limit(100)
      .then(({ data: rs }) => { setResponses(rs || []); setLoading(false) })
  }, [webinarId])

  async function toggleHasQuiz(val: boolean) {
    setTogglingQuiz(true)
    await supabase.from('webi_webinars').update({ has_quiz: val }).eq('id', webinarId)
    setHasQuiz(val)
    setTogglingQuiz(false)
  }

  function openCreate() {
    setEditItem(null)
    setForm({
      question: '',
      options: ['', '', '', ''],
      correct_index: 0,
      sort_order: questions.length,
    })
    setShowModal(true)
  }

  function openEdit(q: Question) {
    setEditItem(q)
    const opts = [...(q.options || []), '', '', '', ''].slice(0, 4)
    setForm({
      question: q.question,
      options: opts,
      correct_index: q.correct_index,
      sort_order: q.sort_order,
    })
    setShowModal(true)
  }

  async function save() {
    setSaving(true)
    const validOptions = form.options.filter(o => o.trim())
    if (validOptions.length < 2) {
      alert('Insira pelo menos 2 opções de resposta.')
      setSaving(false)
      return
    }

    const payload = {
      webinar_id: webinarId,
      question: form.question,
      options: validOptions,
      correct_index: Math.min(form.correct_index, validOptions.length - 1),
      sort_order: form.sort_order,
    }

    if (editItem) {
      await supabase.from('webi_quiz_questions').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('webi_quiz_questions').insert(payload)
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function deleteQuestion(id: string) {
    if (!confirm('Excluir esta questão?')) return
    await supabase.from('webi_quiz_questions').delete().eq('id', id)
    load()
  }

  async function moveQuestion(q: Question, direction: 'up' | 'down') {
    const idx = questions.findIndex(x => x.id === q.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= questions.length) return
    const swap = questions[swapIdx]
    await Promise.all([
      supabase.from('webi_quiz_questions').update({ sort_order: swap.sort_order }).eq('id', q.id),
      supabase.from('webi_quiz_questions').update({ sort_order: q.sort_order }).eq('id', swap.id),
    ])
    load()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const avgScore = responses.length > 0
    ? Math.round(responses.reduce((s, r) => s + r.score, 0) / responses.length)
    : 0

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>
              Webinars
            </Link>{' '}/ {webinarName}
          </div>
          <h1 className="page-title">📝 Quiz do Webinar</h1>
          <p className="page-subtitle">
            Configure perguntas de múltipla escolha que os participantes podem responder durante o webinar.
            Aprovados (≥70%) recebem um certificado para download.
          </p>
        </div>
        {activeTab === 'questions' && (
          <button className="btn btn-primary" onClick={openCreate}>+ Adicionar Questão</button>
        )}
      </div>

      {/* has_quiz toggle */}
      <div style={{ margin: '0 24px 20px', background: 'var(--bg-card)', borderRadius: 12, padding: '16px 20px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>🎯 Quiz no Chat — Integração Ativa</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {hasQuiz
              ? 'Quiz ativo! Questões aparecem no chat quando configuradas na '
              : 'Ative para que as questões possam ser disparadas via '}
            <Link href={`/admin/projects/${projectId}/webinars/${webinarId}/events`} style={{ color: 'var(--brand)' }}>⚡ Timeline</Link>.
          </div>
        </div>
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 48, height: 26, borderRadius: 13,
            background: hasQuiz ? 'var(--brand)' : 'var(--border)',
            position: 'relative', transition: 'background 0.2s',
            opacity: togglingQuiz ? 0.6 : 1,
          }} onClick={() => !togglingQuiz && toggleHasQuiz(!hasQuiz)}>
            <div style={{
              position: 'absolute', top: 3, left: hasQuiz ? 24 : 3,
              width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: hasQuiz ? 'var(--brand)' : 'var(--text-muted)' }}>
            {hasQuiz ? 'Ativo' : 'Inativo'}
          </span>
        </label>
      </div>

      {/* Stats */}
      {responses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '0 24px 24px' }}>
          {[
            { label: 'Respostas', value: responses.length, icon: '📊' },
            { label: 'Nota Média', value: `${avgScore}%`, icon: '🏆' },
            { label: 'Aprovações', value: `${responses.filter(r => r.score >= 70).length}`, icon: '✅' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', margin: '0 24px', marginBottom: 24 }}>
        {([
          { id: 'questions', label: '❓ Questões', count: questions.length },
          { id: 'responses', label: '📊 Respostas', count: responses.length },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px', fontSize: 13, fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--brand)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--brand)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? 'var(--brand)' : 'var(--border)',
                color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
                borderRadius: 99, padding: '0 6px', fontSize: 11,
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="page-body">
        {/* Info card */}
        <div className="card" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 24 }}>💡</span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Como funciona</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                O quiz aparece quando o participante clica no botão <strong>📝 Quiz</strong> no topo da sala.
                Configure questões de múltipla escolha — marque a resposta correta de cada uma.
                Participantes com nota ≥ 70% recebem um <strong>certificado de conclusão</strong> para download.
              </div>
            </div>
          </div>
        </div>

        {/* QUESTIONS TAB */}
        {activeTab === 'questions' && (
          <>
            {questions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <div className="empty-title">Nenhuma questão cadastrada</div>
                <div className="empty-desc">Adicione perguntas de múltipla escolha para o quiz do webinar</div>
                <button className="btn btn-primary" onClick={openCreate}>Adicionar Questão</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {questions.map((q, idx) => (
                  <div key={q.id} className="card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      {/* Order badge */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, color: 'var(--brand)', flexShrink: 0,
                      }}>
                        {idx + 1}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{q.question}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {(q.options || []).map((opt, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 12px', borderRadius: 8,
                                background: i === q.correct_index ? 'rgba(34,197,94,0.1)' : 'var(--bg)',
                                border: `1px solid ${i === q.correct_index ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                              }}
                            >
                              <span style={{
                                fontWeight: 700, fontSize: 12,
                                color: i === q.correct_index ? '#22c55e' : 'var(--text-muted)',
                              }}>
                                {String.fromCharCode(65 + i)}.
                              </span>
                              <span style={{ fontSize: 13 }}>{opt}</span>
                              {i === q.correct_index && (
                                <span style={{ marginLeft: 'auto', fontSize: 14 }}>✅</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => moveQuestion(q, 'up')}
                          disabled={idx === 0}
                          title="Mover para cima"
                        >↑</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => moveQuestion(q, 'down')}
                          disabled={idx === questions.length - 1}
                          title="Mover para baixo"
                        >↓</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(q)} title="Editar">✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q.id)} title="Excluir">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* RESPONSES TAB */}
        {activeTab === 'responses' && (
          <>
            {responses.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <div className="empty-title">Nenhuma resposta ainda</div>
                <div className="empty-desc">As respostas dos participantes aparecerão aqui</div>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Participante</th>
                      <th>Email</th>
                      <th>Nota</th>
                      <th>Resultado</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500 }}>{r.lead_name || '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.lead_email || '—'}</td>
                        <td>
                          <span style={{
                            fontWeight: 800, fontSize: 16,
                            color: r.score >= 70 ? '#22c55e' : '#ef4444',
                          }}>
                            {r.score}%
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${r.score >= 70 ? 'badge-active' : 'badge-draft'}`}>
                            {r.score >= 70 ? '✅ Aprovado' : '❌ Reprovado'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(r.completed_at).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Question Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editItem ? 'Editar Questão' : 'Nova Questão'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Pergunta *</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Ex: Qual é o principal benefício da estratégia X?"
                  value={form.question}
                  onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                  Opções de Resposta *
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                    (mín. 2, máx. 4 — clique na ✅ para marcar a correta)
                  </span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, correct_index: i }))}
                        style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: form.correct_index === i ? 'rgba(34,197,94,0.2)' : 'var(--bg)',
                          border: `2px solid ${form.correct_index === i ? '#22c55e' : 'var(--border)'}`,
                          cursor: 'pointer', fontSize: 14,
                          transition: 'all 0.15s',
                        }}
                        title={`Marcar opção ${String.fromCharCode(65 + i)} como correta`}
                      >
                        {form.correct_index === i ? '✅' : String.fromCharCode(65 + i)}
                      </button>
                      <input
                        className="form-input"
                        placeholder={`Opção ${String.fromCharCode(65 + i)}${i < 2 ? ' *' : ' (opcional)'}`}
                        value={opt}
                        onChange={e => setForm(f => {
                          const options = [...f.options]
                          options[i] = e.target.value
                          return { ...f, options }
                        })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Ordem de exibição</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  style={{ maxWidth: 120 }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={!form.question.trim() || form.options.filter(o => o.trim()).length < 2 || saving}
              >
                {saving ? <span className="spinner" /> : editItem ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
