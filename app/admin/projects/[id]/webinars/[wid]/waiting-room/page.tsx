'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'

export default function WaitingRoomConfigPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [webinarName, setWebinarName] = useState('')
  const [form, setForm] = useState({
    waiting_room_enabled: false,
    waiting_room_message: 'O webinar começa em instantes! Prepare-se. 🚀',
    waiting_delay_seconds: 120,
  })

  useEffect(() => {
    supabase
      .from('webi_webinars')
      .select('name, waiting_room_enabled, waiting_room_message, waiting_delay_seconds')
      .eq('id', wid)
      .single()
      .then(({ data }) => {
        if (data) {
          setWebinarName(data.name)
          setForm({
            waiting_room_enabled: data.waiting_room_enabled || false,
            waiting_room_message: data.waiting_room_message || 'O webinar começa em instantes! Prepare-se. 🚀',
            waiting_delay_seconds: data.waiting_delay_seconds ?? 120,
          })
        }
        setLoading(false)
      })
  }, [wid])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('webi_webinars').update(form).eq('id', wid)
    setSaving(false)
    toast.success('Sala de espera salva!')
  }

  const mins = Math.floor(form.waiting_delay_seconds / 60)
  const secs = form.waiting_delay_seconds % 60

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/admin/projects/${id}/webinars`} className="btn btn-ghost btn-sm">← Webinars</Link>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>⏳ Sala de Espera</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Exibe uma tela de contagem regressiva antes do participante entrar na sala do webinar.
          Aumenta o senso de urgência e o comprometimento com o evento.
        </p>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Enable toggle */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Ativar Sala de Espera</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              O participante verá um timer antes de entrar
            </div>
          </div>
          <label style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', width: 48, height: 28, flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={form.waiting_room_enabled}
              onChange={e => setForm(f => ({ ...f, waiting_room_enabled: e.target.checked }))}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: 99, cursor: 'pointer', transition: '0.3s',
              background: form.waiting_room_enabled ? '#6366f1' : 'var(--border)',
            }}>
              <span style={{
                position: 'absolute', height: 20, width: 20,
                left: form.waiting_room_enabled ? 24 : 4, bottom: 4,
                background: 'white', borderRadius: '50%', transition: '0.3s',
              }} />
            </span>
          </label>
        </div>

        {/* Delay */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⏱ Tempo de espera</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Quanto tempo o participante vai esperar antes de entrar.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="number" min={0} max={3600}
              className="form-input"
              value={form.waiting_delay_seconds}
              onChange={e => setForm(f => ({ ...f, waiting_delay_seconds: +e.target.value }))}
              style={{ width: 120 }}
            />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>
              = {mins > 0 ? `${mins} min ` : ''}{secs > 0 ? `${secs} seg` : mins === 0 ? '0 seg' : ''}
            </span>
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[30, 60, 120, 300, 600].map(v => (
              <button
                key={v} type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, opacity: form.waiting_delay_seconds === v ? 1 : 0.6 }}
                onClick={() => setForm(f => ({ ...f, waiting_delay_seconds: v }))}
              >
                {v < 60 ? `${v}s` : `${v / 60}min`}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>💬 Mensagem de Espera</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Texto exibido abaixo do contador para o participante.
          </div>
          <textarea
            className="form-input"
            rows={3}
            value={form.waiting_room_message}
            onChange={e => setForm(f => ({ ...f, waiting_room_message: e.target.value }))}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Link to live page */}
        <div style={{
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>🎬 Relógio da sessão e curva de audiência estão em <strong>Ao Vivo</strong>.</span>
          <Link href={`/admin/projects/${id}/webinars/${wid}/live`} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
            Ir para Ao Vivo →
          </Link>
        </div>

        {/* Preview note */}
        <div style={{
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--text-secondary)',
        }}>
          💡 A cor do timer e dos elementos de destaque usará a <strong>cor de branding</strong> configurada no projeto.
          Configure em <Link href={`/admin/projects/${id}/branding`} style={{ color: '#a5b4fc' }}>🎨 Branding</Link>.
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? '⏳ Salvando...' : '💾 Salvar'}
        </button>
      </form>
    </div>
  )
}
