'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'

const FIELD_OPTIONS = [
  { key: 'phone', label: 'Telefone / WhatsApp', placeholder: '(11) 99999-9999', defaultLabel: 'Seu WhatsApp' },
  { key: 'whatsapp', label: 'WhatsApp (campo separado)', placeholder: '(11) 99999-9999', defaultLabel: 'WhatsApp com DDD' },
  { key: 'cpf', label: 'CPF', placeholder: '000.000.000-00', defaultLabel: 'Seu CPF' },
  { key: 'company', label: 'Empresa', placeholder: 'Nome da sua empresa', defaultLabel: 'Empresa' },
  { key: 'role', label: 'Cargo / Profissão', placeholder: 'Ex.: Empresário, Médico...', defaultLabel: 'Cargo ou Profissão' },
  { key: 'custom_1', label: 'Campo Personalizado 1', placeholder: 'Resposta...', defaultLabel: 'Campo extra' },
]

export default function FormPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()
  const [webinarName, setWebinarName] = useState('')
  const [formFields, setFormFields] = useState<string[]>(['name', 'email', 'phone'])
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('webi_webinars')
        .select('name, form_fields')
        .eq('id', webinarId)
        .single()
      if (data) {
        setWebinarName(data.name)
        const fields = data.form_fields as unknown
        if (Array.isArray(fields)) {
          // Support both simple array ["phone"] and array of objects [{key:"phone",label:"..."}]
          const keys: string[] = []
          const labels: Record<string, string> = {}
          ;(fields as unknown[]).forEach((f: unknown) => {
            if (typeof f === 'string') keys.push(f)
            else if (f && typeof f === 'object' && 'key' in f) {
              const fo = f as { key: string; label?: string }
              keys.push(fo.key)
              if (fo.label) labels[fo.key] = fo.label
            }
          })
          setFormFields(keys.length ? keys : ['name', 'email', 'phone'])
          setFieldLabels(labels)
        }
      }
      setLoading(false)
    }
    load()
  }, [webinarId])

  async function save() {
    setSaving(true)
    // Save as array of objects with key + label
    const enrichedFields = formFields.map(k => ({
      key: k,
      label: fieldLabels[k] || FIELD_OPTIONS.find(f => f.key === k)?.defaultLabel || k,
    }))
    await supabase.from('webi_webinars').update({
      form_fields: enrichedFields,
    }).eq('id', webinarId)
    setSaving(false)
    toast.success('Formulário salvo!')
  }

  function toggleField(key: string) {
    setFormFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">📋 Campos do Formulário</h1>
          <p className="page-subtitle">Configure quais campos aparecem na página de inscrição do seu webinar</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="spinner" /> : '💾 Salvar'}
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Fixed fields */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🔒 Campos Obrigatórios (não podem ser removidos)</div>
          {['name', 'email'].map(k => (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: '1px solid var(--border)'
            }}>
              <span style={{ fontSize: 20 }}>{k === 'name' ? '👤' : '✉️'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{k === 'name' ? 'Nome Completo' : 'E-mail'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sempre visível no formulário</div>
              </div>
              <span className="badge badge-active">● Ativo</span>
            </div>
          ))}
        </div>

        {/* Configurable fields */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⚙️ Campos Opcionais</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Ative os campos que deseja coletar. Você pode personalizar o rótulo de cada campo.
          </div>
          {FIELD_OPTIONS.map(opt => {
            const active = formFields.includes(opt.key)
            return (
              <div key={opt.key} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 0', borderBottom: '1px solid var(--border)',
                opacity: active ? 1 : 0.55,
                transition: 'opacity 0.2s'
              }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleField(opt.key)}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand)' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                  {active && (
                    <div style={{ marginTop: 6 }}>
                      <input
                        className="form-input"
                        style={{ fontSize: 13, padding: '6px 10px' }}
                        placeholder={`Rótulo: ex. "${opt.defaultLabel}"`}
                        value={fieldLabels[opt.key] || ''}
                        onChange={e => setFieldLabels(prev => ({ ...prev, [opt.key]: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
                {active
                  ? <span className="badge badge-active">● Ativo</span>
                  : <span className="badge badge-draft">○ Inativo</span>}
              </div>
            )
          })}
        </div>

        {/* Preview */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>👁 Preview da Ordem dos Campos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['name', 'email', ...formFields.filter(f => f !== 'name' && f !== 'email')].map((k, i) => {
              const opt = FIELD_OPTIONS.find(f => f.key === k)
              const label = k === 'name' ? 'Nome Completo' : k === 'email' ? 'E-mail' : (fieldLabels[k] || opt?.defaultLabel || k)
              return (
                <div key={k} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px',
                  border: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{i + 1}.</span>
                  <div style={{ flex: 1, fontWeight: 500 }}>{label}</div>
                  {(k === 'name' || k === 'email') && (
                    <span className="badge badge-active" style={{ fontSize: 11 }}>obrigatório</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
