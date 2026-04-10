'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { Webinar } from '@/types'

export default function RegistrationPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  
  const [form, setForm] = useState({
    landing_headline: '',
    landing_subheadline: '',
    landing_button_text: '',
  })

  useEffect(() => {
    async function load() {
      const { data: w } = await supabase.from('webi_webinars').select('*').eq('id', wid).single()
      if (w) {
        setWebinar(w)
        setForm({
          landing_headline: w.landing_headline || '',
          landing_subheadline: w.landing_subheadline || '',
          landing_button_text: w.landing_button_text || 'Quero me inscrever',
        })
      }
      setLoading(false)
    }
    load()
  }, [wid, supabase])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('webi_webinars').update({
      landing_headline: form.landing_headline,
      landing_subheadline: form.landing_subheadline,
      landing_button_text: form.landing_button_text,
    }).eq('id', wid)
    
    setSaving(false)
    
    if (error) {
      toast.error('Erro ao salvar as configurações.')
    } else {
      toast.success('Configurações da Página de Captura salvas!')
    }
  }

  if (loading || !webinar) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 24px' }}>
      <Toaster position="top-right" />
      
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${id}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinar.name}
          </div>
          <h1 className="page-title">🧲 Página de Captura</h1>
          <p className="page-subtitle">Configure a landing page integrada (onde o lead se cadastra para acessar a sala).</p>
        </div>
        <Link 
          href={`/r/${webinar.slug}`} 
          target="_blank"
          className="btn btn-secondary" 
          style={{ gap: 8 }}
        >
          <span>👁️</span> Visualizar Página
        </Link>
      </div>

      <div className="card">
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          <div className="form-group">
            <label>Headline (Título Principal)</label>
            <input
              type="text"
              required
              className="input"
              placeholder="Ex: Como faturar R$ 10 mil nos próximos 30 dias..."
              value={form.landing_headline}
              onChange={e => setForm({ ...form, landing_headline: e.target.value })}
            />
            <p className="help-text">A promessa principal que fará as pessoas se cadastrarem na sua aula.</p>
          </div>

          <div className="form-group">
            <label>Subheadline (Texto de Apoio)</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Ex: Descubra o método validado e passo a passo gratuito nesta apresentação ao vivo exclusiva."
              value={form.landing_subheadline}
              onChange={e => setForm({ ...form, landing_subheadline: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Texto do Botão de Cadastro</label>
            <input
              type="text"
              className="input"
              placeholder="Ex: Quero me inscrever agora"
              value={form.landing_button_text}
              onChange={e => setForm({ ...form, landing_button_text: e.target.value })}
              style={{ maxWidth: 300 }}
            />
          </div>

          <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
            <strong style={{ color: '#fff', display: 'block', marginBottom: 4 }}>💡 Dica sobre o Design</strong>
            O fundo visual e a cor do botão da sua Landing Page respeitarão as configurações de <strong>Plano de Fundo Customizado</strong> e <strong>Cor da Marca</strong> définidos na aba <Link href={`/admin/projects/${id}/webinars/${wid}`} style={{ color: 'var(--brand-light)' }}>Visão Geral</Link>.
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <button 
              className="btn btn-primary" 
              type="submit" 
              disabled={saving}
            >
              {saving ? 'Copiando...' : 'Salvar Alterações'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
