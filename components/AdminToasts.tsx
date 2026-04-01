'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Toast {
  id: string
  icon: string
  title: string
  body: string
  color: string
  timestamp: Date
}

let toastIdCounter = 0

export default function AdminToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const supabase = createClient()

  const addToast = useCallback((toast: Omit<Toast, 'id' | 'timestamp'>) => {
    const id = `toast-${++toastIdCounter}`
    setToasts(t => [...t, { ...toast, id, timestamp: new Date() }])
    // Auto-dismiss after 6s
    setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id))
    }, 6000)
  }, [])

  useEffect(() => {
    // Subscribe to new leads in real time
    const leadsChannel = supabase
      .channel('admin-new-leads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'webi_leads' },
        (payload) => {
          const record = payload.new as { name?: string }
          addToast({
            icon: '👤',
            title: 'Novo Lead!',
            body: record.name ? `${record.name} acabou de se cadastrar` : 'Um novo lead se registrou',
            color: '#22c55e',
          })
        }
      )
      .subscribe()

    // Subscribe to quiz responses (certificate downloaded)
    const quizChannel = supabase
      .channel('admin-quiz-certs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'webi_quiz_responses' },
        (payload) => {
          const record = payload.new as { score_percent: number; user_name?: string }
          if (record.score_percent >= 70) {
            addToast({
              icon: '🎓',
              title: 'Certificado Conquistado!',
              body: `${record.user_name || 'Um participante'} atingiu ${record.score_percent}% no quiz`,
              color: '#6366f1',
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(leadsChannel)
      supabase.removeChannel(quizChannel)
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            pointerEvents: 'all',
            background: 'var(--bg-elevated)',
            border: `1px solid ${toast.color}40`,
            borderLeft: `4px solid ${toast.color}`,
            borderRadius: 12,
            padding: '12px 16px',
            minWidth: 280,
            maxWidth: 360,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${toast.color}20`,
            animation: 'toastSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
          onClick={() => setToasts(t => t.filter(x => x.id !== toast.id))}
        >
          {/* Icon bubble */}
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: `${toast.color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}>
            {toast.icon}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: toast.color, marginBottom: 2 }}>
              {toast.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {toast.body}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {toast.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 4,
            right: 0,
            height: 3,
            borderRadius: '0 0 12px 12px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              background: toast.color,
              animation: 'toastProgress 6s linear forwards',
              borderRadius: 2,
            }} />
          </div>

          <style>{`
            @keyframes toastSlideIn {
              from { transform: translateX(120%) scale(0.9); opacity: 0; }
              to   { transform: translateX(0) scale(1); opacity: 1; }
            }
            @keyframes toastProgress {
              from { width: 100%; }
              to   { width: 0%; }
            }
          `}</style>
        </div>
      ))}
    </div>
  )
}
