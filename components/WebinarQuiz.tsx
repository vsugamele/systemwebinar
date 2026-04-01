'use client'

import { useEffect, useState, useRef } from 'react'

interface Question {
  id: string
  question: string
  options: string[]
  correct_index: number
  sort_order: number
}

interface Props {
  webinarId: string
  webinarName: string
  userName?: string
  userEmail?: string
  open: boolean
  onClose: () => void
}

export default function WebinarQuiz({ webinarId, webinarName, userName = '', userEmail = '', open, onClose }: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [step, setStep] = useState<'quiz' | 'result' | 'cert'>('quiz')
  const [current, setCurrent] = useState(0)
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState(userName)
  const [submitting, setSubmitting] = useState(false)
  const certRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !webinarId) return
    setLoading(true)
    fetch(`/api/quiz?webinar_id=${webinarId}`)
      .then(r => r.json())
      .then(data => {
        setQuestions(data)
        setAnswers({})
        setCurrent(0)
        setStep('quiz')
        setLoading(false)
      })
  }, [open, webinarId])

  function selectAnswer(qIdx: number, aIdx: number) {
    setAnswers(a => ({ ...a, [qIdx]: aIdx }))
  }

  async function finish() {
    setSubmitting(true)
    let correct = 0
    questions.forEach((q, i) => {
      if (answers[i] === q.correct_index) correct++
    })
    const finalScore = Math.round((correct / questions.length) * 100)
    setScore(finalScore)

    await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webinar_id: webinarId,
        lead_name: name,
        lead_email: userEmail,
        answers: Object.values(answers),
        score: finalScore,
        total: questions.length,
      }),
    }).catch(() => {})

    setStep('result')
    setSubmitting(false)
  }

  async function downloadCertificate() {
    const mod = await import('html2canvas').catch(() => null)
    const html2canvas = mod?.default ?? null
    if (!html2canvas || !certRef.current) {
      window.print()
      return
    }
    const canvas = await html2canvas(certRef.current, { scale: 2, backgroundColor: '#0d1117' })
    const link = document.createElement('a')
    link.download = `certificado-${webinarName.toLowerCase().replace(/\s+/g, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  if (!open) return null

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 20, padding: 32, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" />
            <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Carregando quiz...</p>
          </div>
        ) : questions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
            <p style={{ color: 'var(--text-muted)' }}>Nenhuma questão configurada para este webinar.</p>
            <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 16 }}>Fechar</button>
          </div>
        ) : step === 'quiz' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>📝 Quiz do Webinar</h2>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{current + 1} / {questions.length}</span>
            </div>

            {/* Progress Bar */}
            <div style={{ background: 'var(--bg)', borderRadius: 99, height: 6, marginBottom: 28, overflow: 'hidden' }}>
              <div style={{
                background: 'var(--brand)', height: '100%',
                width: `${((current + 1) / questions.length) * 100}%`,
                transition: 'width 0.3s ease',
                borderRadius: 99,
              }} />
            </div>

            {/* Name input (first question only) */}
            {current === 0 && (
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">Seu nome (para o certificado)</label>
                <input
                  className="form-input"
                  placeholder="Digite seu nome completo"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            )}

            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, lineHeight: 1.5 }}>
              {questions[current].question}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {questions[current].options.map((opt, i) => {
                const selected = answers[current] === i
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(current, i)}
                    style={{
                      background: selected ? 'rgba(99,102,241,0.2)' : 'var(--bg)',
                      border: `2px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '12px 16px',
                      textAlign: 'left', color: 'var(--text-primary)',
                      cursor: 'pointer', fontSize: 14, fontWeight: selected ? 600 : 400,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontWeight: 700, marginRight: 8, color: 'var(--brand)' }}>
                      {String.fromCharCode(65 + i)}.
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              {current > 0 && (
                <button className="btn btn-ghost" onClick={() => setCurrent(c => c - 1)}>← Anterior</button>
              )}
              {current < questions.length - 1 ? (
                <button
                  className="btn btn-primary" style={{ flex: 1 }}
                  onClick={() => setCurrent(c => c + 1)}
                  disabled={answers[current] === undefined}
                >
                  Próxima →
                </button>
              ) : (
                <button
                  className="btn btn-primary" style={{ flex: 1 }}
                  onClick={finish}
                  disabled={answers[current] === undefined || submitting || !name.trim()}
                >
                  {submitting ? <span className="spinner" /> : '✅ Finalizar Quiz'}
                </button>
              )}
            </div>
          </>
        ) : step === 'result' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>
              {score >= 70 ? '🏆' : '📚'}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
              Você acertou {score}%
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              {score >= 70
                ? '🎉 Parabéns! Você passou e pode baixar seu certificado!'
                : '💪 Continue estudando! Você precisa de 70% para o certificado.'}
            </p>

            {/* Score bars per question */}
            <div style={{ textAlign: 'left', marginBottom: 24 }}>
              {questions.map((q, i) => {
                const correct = answers[i] === q.correct_index
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{correct ? '✅' : '❌'}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }} className="line-clamp-1">
                      {q.question}
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {score >= 70 && (
                <button className="btn btn-primary" onClick={() => setStep('cert')}>
                  🎓 Ver Certificado
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => { setStep('quiz'); setCurrent(0); setAnswers({}) }}
              >
                🔄 Tentar novamente
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
            </div>
          </div>
        ) : (
          // Certificate view
          <div>
            <div ref={certRef} style={{
              background: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
              border: '2px solid #6366f1',
              borderRadius: 16, padding: '40px 32px', textAlign: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Decorative border */}
              <div style={{
                position: 'absolute', inset: 8,
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 12, pointerEvents: 'none',
              }} />

              <div style={{ fontSize: 40, marginBottom: 12 }}>🎓</div>
              <p style={{ fontSize: 11, letterSpacing: '0.2em', color: '#6366f1', textTransform: 'uppercase', marginBottom: 8 }}>
                Certificado de Conclusão
              </p>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                {name || userName}
              </h1>
              <p style={{ color: '#8b949e', fontSize: 14, marginBottom: 20 }}>
                concluiu com aprovação o webinar
              </p>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#6366f1', marginBottom: 20, padding: '0 16px' }}>
                {webinarName}
              </h2>
              <div style={{
                display: 'inline-block', background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8,
                padding: '6px 16px', fontSize: 13, color: '#a5b4fc', marginBottom: 24,
              }}>
                Nota: {score}% ✨
              </div>
              <div style={{ borderTop: '1px solid rgba(99,102,241,0.2)', paddingTop: 16 }}>
                <p style={{ fontSize: 12, color: '#8b949e' }}>{today}</p>
                <p style={{ fontSize: 11, color: '#484f58', marginTop: 4 }}>WebinarFlow • webinarflow.app</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={downloadCertificate}>
                📥 Baixar Certificado
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
