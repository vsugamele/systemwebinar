'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'react-hot-toast'
import type { Project, Webinar } from '@/types'

interface EmailTemplate {
  id: string
  webinar_id: string
  type: 'confirmation' | 'reminder_48h' | 'reminder_24h' | 'reminder_15min' | 'followup' | 'replay'
  subject: string
  body: string
  delay_minutes: number
  enabled: boolean
  created_at: string
}

const defaultTemplates: Omit<EmailTemplate, 'id' | 'webinar_id' | 'created_at'>[] = [
  {
    type: 'confirmation',
    subject: '🎬 {{name}}, seu lugar está confirmado!',
    body: `Olá {{name}},\n\nSeu cadastro foi confirmado com sucesso!\n\nAcesse o webinar no link abaixo:\n{{webinar_url}}\n\nNos vemos em breve!\n`,
    delay_minutes: 0,
    enabled: true,
  },
  {
    type: 'reminder_48h',
    subject: '⏰ Lembrete: Seu webinar começa em 48h',
    body: `Olá {{name}},\n\nNão esqueça! Seu webinar começa em 48 horas.\n\nAcesse: {{webinar_url}}\n\nTe esperamos lá!`,
    delay_minutes: -2880,
    enabled: true,
  },
  {
    type: 'reminder_24h',
    subject: '⏰ [AMANHÃ] Está preparado(a)?',
    body: `Olá {{name}},\n\nSeu webinar é AMANHÃ! Separe um horário especial.\n\nLink de acesso: {{webinar_url}}\n\nAté amanhã!`,
    delay_minutes: -1440,
    enabled: true,
  },
  {
    type: 'reminder_15min',
    subject: '🔴 Já estou te esperando! Começa em 15 minutos',
    body: `Olá {{name}},\n\nO webinar começa em 15 MINUTOS!\n\nClique agora para acessar: {{webinar_url}}\n\nNos vemos já!`,
    delay_minutes: -15,
    enabled: true,
  },
  {
    type: 'followup',
    subject: '📩 E aí, conseguiu assistir?',
    body: `Olá {{name}},\n\nSentimos sua falta! O webinar foi incrível mas ainda dá tempo de ver o replay.\n\nAcesse agora: {{webinar_url}}\n\nO link expira em breve!`,
    delay_minutes: 1440,
    enabled: true,
  },
  {
    type: 'replay',
    subject: '🎬 Replay disponível — assista antes de expirar',
    body: `Olá {{name}},\n\nEste é seu último aviso! O replay do webinar está disponível por tempo limitado.\n\nAssista agora: {{webinar_url}}\n\nNão perca essa oportunidade!`,
    delay_minutes: 2880,
    enabled: true,
  },
]

const typeLabels: Record<string, { label: string; timing: string; icon: string }> = {
  confirmation:  { label: 'Confirmação',    timing: 'Imediato',       icon: '✅' },
  reminder_48h:  { label: '48h Antes',      timing: '48h antes',      icon: '📅' },
  reminder_24h:  { label: '24h Antes',      timing: '24h antes',      icon: '⏰' },
  reminder_15min:{ label: '15min Antes',    timing: '15min antes',    icon: '🔴' },
  followup:      { label: 'Follow-up',      timing: '24h após',       icon: '📩' },
  replay:        { label: 'Replay',         timing: '48h após',       icon: '🎬' },
}

export default function EmailsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedWebinar, setSelectedWebinar] = useState('')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function loadTemplates() {
    const { data } = await supabase
      .from('webi_email_templates')
      .select('*')
      .eq('webinar_id', selectedWebinar)
      .order('delay_minutes')
    if (data && data.length > 0) {
      setTemplates(data)
    } else {
      // Create defaults
      const toInsert = defaultTemplates.map(t => ({ ...t, webinar_id: selectedWebinar }))
      const { data: inserted } = await supabase.from('webi_email_templates').insert(toInsert).select()
      setTemplates((inserted || []).sort((a, b) => a.delay_minutes - b.delay_minutes))
    }
  }

  useEffect(() => {
    supabase.from('webi_projects').select('*').order('created_at').then(({ data }) => setProjects(data || []))
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    supabase.from('webi_webinars').select('*').eq('project_id', selectedProject).order('created_at', { ascending: false })
      .then(({ data }) => setWebinars(data || []))
  }, [selectedProject])

  useEffect(() => {
    if (!selectedWebinar) return
    supabase.from('webi_email_templates').select('*').eq('webinar_id', selectedWebinar).order('delay_minutes')
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          setTemplates(data)
        } else {
          const toInsert = defaultTemplates.map(t => ({ ...t, webinar_id: selectedWebinar }))
          const { data: inserted } = await supabase.from('webi_email_templates').insert(toInsert).select()
          setTemplates((inserted || []).sort((a, b) => a.delay_minutes - b.delay_minutes))
        }
      })
  }, [selectedWebinar])

  async function saveTemplate() {
    if (!editTemplate) return
    setSaving(true)
    try {
      await supabase.from('webi_email_templates')
        .update({ subject: editTemplate.subject, body: editTemplate.body, enabled: editTemplate.enabled })
        .eq('id', editTemplate.id)
      toast.success('Template de e-mail atualizado!')
      setEditTemplate(null)
      loadTemplates()
    } catch (err) {
      toast.error('Ocorreu um erro ao atualizar o e-mail.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(t: EmailTemplate) {
    try {
      await supabase.from('webi_email_templates').update({ enabled: !t.enabled }).eq('id', t.id)
      toast.success(t.enabled ? 'E-mail desativado.' : 'E-mail ativado!')
      loadTemplates()
    } catch (err) {
      toast.error('Erro ao alternar status do e-mail.')
    }
  }

  const orderedTemplates = Object.keys(typeLabels).map(type =>
    templates.find(t => t.type === type)
  ).filter(Boolean) as EmailTemplate[]

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sequência de E-mails</h1>
          <p className="page-subtitle">Configure e-mails automáticos para cada webinar</p>
        </div>
      </div>

      <div className="page-body">
        {/* Selectors */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
          <select className="form-input form-select" style={{ maxWidth: 220 }}
            value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedWebinar(''); setTemplates([]) }}>
            <option value="">Selecionar projeto...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-input form-select" style={{ maxWidth: 300 }}
            value={selectedWebinar} onChange={e => setSelectedWebinar(e.target.value)}
            disabled={!selectedProject}>
            <option value="">Selecionar webinar...</option>
            {webinars.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        {!selectedWebinar && (
          <div className="empty-state">
            <div className="empty-icon">✉️</div>
            <div className="empty-title">Selecione um webinar</div>
            <div className="empty-desc">Configure a sequência de e-mails automáticos para seus leads</div>
          </div>
        )}

        {selectedWebinar && orderedTemplates.length > 0 && (
          <>
            {/* Timeline */}
            <div style={{ position: 'relative', marginBottom: 32 }}>
              <div style={{
                position: 'absolute', left: 28, top: 0, bottom: 0,
                width: 2, background: 'var(--border)', zIndex: 0
              }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {orderedTemplates.map((t) => {
                  const meta = typeLabels[t.type]
                  return (
                    <div key={t.id} style={{ display: 'flex', gap: 20, position: 'relative', paddingBottom: 24 }}>
                      {/* Node */}
                      <div style={{
                        width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                        background: t.enabled ? 'var(--brand)' : 'var(--bg-elevated)',
                        border: `2px solid ${t.enabled ? 'var(--brand)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, zIndex: 1, boxShadow: t.enabled ? '0 0 0 4px rgba(99,102,241,0.15)' : 'none',
                        cursor: 'pointer', transition: 'all 0.2s',
                      }} onClick={() => toggleEnabled(t)}>
                        {meta.icon}
                      </div>
                      {/* Card */}
                      <div style={{
                        flex: 1, background: 'var(--bg-card)',
                        border: `1px solid ${t.enabled ? 'var(--border)' : 'var(--border)'}`,
                        borderLeft: `3px solid ${t.enabled ? 'var(--brand)' : 'var(--border)'}`,
                        borderRadius: 12, padding: '16px 20px',
                        opacity: t.enabled ? 1 : 0.5,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                              {meta.label}
                              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)',
                                background: 'var(--bg-elevated)', borderRadius: 20, padding: '2px 8px' }}>
                                {meta.timing}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                              {t.subject}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setEditTemplate({ ...t }) }}>
                              ✏️ Editar
                            </button>
                            <button
                              className={`btn btn-sm ${t.enabled ? 'btn-ghost' : 'btn-primary'}`}
                              onClick={() => toggleEnabled(t)}>
                              {t.enabled ? '⏸ Desativar' : '▶ Ativar'}
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                          <span>Enviados: —</span>
                          <span>Abertos: —</span>
                          <span>Cliques: —</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Info box */}
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: 12, padding: 20,
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>📌 Variáveis disponíveis nos templates:</strong><br />
              <code style={{ color: 'var(--brand-light)' }}>{'{{name}}'}</code> — Nome do lead &nbsp;|&nbsp;
              <code style={{ color: 'var(--brand-light)' }}>{'{{email}}'}</code> — E-mail &nbsp;|&nbsp;
              <code style={{ color: 'var(--brand-light)' }}>{'{{webinar_url}}'}</code> — Link direto para a sala &nbsp;|&nbsp;
              <code style={{ color: 'var(--brand-light)' }}>{'{{webinar_name}}'}</code> — Nome do webinar
            </div>
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editTemplate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditTemplate(null)}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {typeLabels[editTemplate.type]?.icon} Editar: {typeLabels[editTemplate.type]?.label}
              </h2>
              <button className="modal-close" onClick={() => setEditTemplate(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Assunto do e-mail</label>
                <input className="form-input"
                  value={editTemplate.subject}
                  onChange={e => setEditTemplate(t => t && ({ ...t, subject: e.target.value }))}
                  placeholder="Assunto do e-mail..." />
              </div>
              <div className="form-group">
                <label className="form-label">Corpo do e-mail</label>
                <textarea className="form-input form-textarea"
                  style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 13 }}
                  value={editTemplate.body}
                  onChange={e => setEditTemplate(t => t && ({ ...t, body: e.target.value }))}
                  placeholder="Corpo do e-mail..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditTemplate(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
