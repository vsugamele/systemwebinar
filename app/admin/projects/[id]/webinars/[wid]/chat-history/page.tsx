'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'

interface ChatMessage {
  id: string
  webinar_id: string
  session_id: string
  author: string
  text: string
  timestamp_video: number
  is_simulated: boolean
  is_broadcast: boolean
  created_at: string
}

function fmtTime(s: number) {
  if (s == null) return '--:--'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function ChatHistoryAdminPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('webi_live_chat')
      .select('*')
      .eq('webinar_id', wid)
      .eq('is_simulated', false)
      .order('timestamp_video', { ascending: true })
      
    if (error) {
      console.error(error)
      toast.error('Erro ao carregar mensagens')
    } else {
      setMessages(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [wid])

  function exportCSV() {
    if (messages.length === 0) return toast.error('Nenhuma mensagem para exportar.')
    
    // Create CSV header
    let csv = 'Data Envio,Minuto Vídeo,Autor,Mensagem\n'
    
    // Add rows
    messages.forEach(msg => {
      const dataEnvio = new Date(msg.created_at).toLocaleString('pt-BR')
      const minutoVideo = fmtTime(msg.timestamp_video)
      // Escape quotes and commas in author/text
      const autor = `"${msg.author.replace(/"/g, '""')}"`
      const mensagem = `"${msg.text.replace(/"/g, '""')}"`
      csv += `${dataEnvio},${minutoVideo},${autor},${mensagem}\n`
    })
    
    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `chat_webinar_${wid}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link>
          </div>
          <h1 className="page-title">💬 Histórico de Chat Real</h1>
          <p className="page-subtitle">
            Veja as mensagens enviadas por espectadores reais durante a sessão.
          </p>
        </div>
        <button className="btn btn-primary" onClick={exportCSV}>
          📥 Exportar CSV
        </button>
      </div>

      {messages.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1.5px dashed var(--border)',
          borderRadius: 16, padding: '48px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhuma mensagem real encontrada</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            As mensagens enviadas por espectadores reais (não simuladas) aparecerão aqui.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Minuto do Vídeo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Data Envio (Real)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Autor</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg, index) => (
                  <tr key={msg.id} style={{ 
                    borderBottom: index < messages.length - 1 ? '1px solid var(--border)' : 'none',
                    background: 'var(--bg-card)'
                  }}>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        background: 'rgba(99,102,241,0.1)', color: 'var(--brand-light)',
                        padding: '2px 8px', borderRadius: 99, fontWeight: 700, fontSize: 11
                      }}>
                        ⏱ {fmtTime(msg.timestamp_video)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(msg.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                      {msg.author}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      {msg.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
