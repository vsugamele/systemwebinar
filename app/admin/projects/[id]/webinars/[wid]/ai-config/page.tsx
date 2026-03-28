'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const OPENROUTER_MODELS = [
  { value: 'google/gemini-flash-1.5', label: 'Gemini 1.5 Flash (Google) — Mais rápido e barato' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (OpenAI) — Excelente custo-benefício' },
  { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (Anthropic) — Respostas naturais' },
  { value: 'mistralai/mistral-7b-instruct', label: 'Mistral 7B — Open source, muito barato' },
  { value: 'google/gemini-pro-1.5', label: 'Gemini 1.5 Pro (Google) — Mais avançado' },
  { value: 'openai/gpt-4o', label: 'GPT-4o (OpenAI) — Maior qualidade' },
]

export default function AIConfigPage() {
  const { id, wid } = useParams() as { id: string; wid: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [projectApiKey, setProjectApiKey] = useState('')
  const [webinarName, setWebinarName] = useState('')

  const [form, setForm] = useState({
    ai_enabled: false,
    ai_model: 'google/gemini-flash-1.5',
    ai_knowledge_base: '',
    ai_system_prompt: '',
    ai_persona_name: '',
    ai_persona_avatar: '',
  })

  useEffect(() => {
    async function load() {
      const [{ data: webinar }, { data: project }] = await Promise.all([
        supabase.from('webi_webinars').select('name, ai_enabled, ai_model, ai_knowledge_base, ai_system_prompt').eq('id', wid).single(),
        supabase.from('webi_projects').select('openrouter_api_key').eq('id', id).single(),
      ])

      if (webinar) {
        setWebinarName(webinar.name)
        setForm({
          ai_enabled: webinar.ai_enabled || false,
          ai_model: webinar.ai_model || 'google/gemini-flash-1.5',
          ai_knowledge_base: webinar.ai_knowledge_base || '',
          ai_system_prompt: webinar.ai_system_prompt || '',
          ai_persona_name: (webinar as any).ai_persona_name || '',
          ai_persona_avatar: (webinar as any).ai_persona_avatar || '',
        })
      }
      if (project) setProjectApiKey(project.openrouter_api_key || '')
      setLoading(false)
    }
    load()
  }, [id, wid])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    await Promise.all([
      supabase.from('webi_webinars').update(form).eq('id', wid),
      supabase.from('webi_projects').update({ openrouter_api_key: projectApiKey }).eq('id', id),
    ])

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>

  const defaultSystemPrompt = `Você é um assistente do webinar "${webinarName}". Responda dúvidas dos participantes de forma concisa, simpática e direta (máximo 2-3 frases). Baseie-se nas informações abaixo. Se não souber, diga "Boa pergunta! O apresentador vai abordar isso!" sem inventar.`

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/admin/projects/${id}/webinars/${wid}`} className="btn btn-ghost btn-sm">
          ← Voltar
        </Link>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🤖 IA no Chat</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Configure o assistente de IA que responde dúvidas automáticas no chat do webinar.
        </p>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Enable toggle */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Ativar IA no Chat</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              A IA detecta perguntas e responde automaticamente no chat como "🤖 Assistente"
            </div>
          </div>
          <label style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', width: 48, height: 28, flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={form.ai_enabled}
              onChange={e => setForm(f => ({ ...f, ai_enabled: e.target.checked }))}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: 99, cursor: 'pointer', transition: '0.3s',
              background: form.ai_enabled ? '#6366f1' : 'var(--border)',
            }}>
              <span style={{
                position: 'absolute', height: 20, width: 20, left: form.ai_enabled ? 24 : 4, bottom: 4,
                background: 'white', borderRadius: '50%', transition: '0.3s',
              }} />
            </span>
          </label>
        </div>

        {/* OpenRouter API Key */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>OpenRouter API Key</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Obtenha sua chave gratuita em{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style={{ color: '#6366f1' }}>
              openrouter.ai/keys
            </a>
            . Esta chave é compartilhada por todos os webinars do projeto.
          </div>
          <input
            className="form-input"
            type="password"
            placeholder="sk-or-v1-..."
            value={projectApiKey}
            onChange={e => setProjectApiKey(e.target.value)}
          />
        </div>

        {/* Model selection */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Modelo de IA</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Escolha o modelo. Modelos mais baratos são suficientes para responder dúvidas simples.
          </div>
          <select
            className="form-input"
            value={form.ai_model}
            onChange={e => setForm(f => ({ ...f, ai_model: e.target.value }))}
          >
            {OPENROUTER_MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Knowledge Base */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Base de Conhecimento</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Cole aqui informações sobre o produto, preços, bônus, garantias, dúvidas frequentes, etc.
            A IA usará essas informações para responder com precisão.
          </div>
          <textarea
            className="form-input"
            rows={12}
            placeholder={`Exemplo:\n\nPRODUTO: Curso XYZ — Aprenda a criar webinars de alta conversão\nPREÇO: R$ 997 ou 12x R$ 97\nGARANTIA: 7 dias de garantia incondicional\nBÔNUS: Planilha de scripts + Templates de email\n\nDÚVIDAS FREQUENTES:\n- Quando começa? Tem acesso imediato após a compra.\n- Tem certificado? Sim, ao final do curso.\n- É ao vivo? Não, é gravado com acesso permanente.`}
            value={form.ai_knowledge_base}
            onChange={e => setForm(f => ({ ...f, ai_knowledge_base: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>

        {/* System Prompt */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div style={{ fontWeight: 700 }}>Instrução da IA (System Prompt)</div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setForm(f => ({ ...f, ai_system_prompt: defaultSystemPrompt }))}
            >
              Usar padrão
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Como a IA deve se comportar. Deixe em branco para usar o padrão.
          </div>

          {/* Persona section */}
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: 10, padding: 14,
            border: '1px solid var(--border)', marginBottom: 8,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🧑‍💼 Identidade do Assistente</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Configure um nome e foto para que a IA pareça uma pessoa real no chat, como um "suporte" ou "moderador".
              Deixe em branco para usar o padrão ("🤖 Assistente").
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nome do Suporte</label>
                <input
                  className="form-input"
                  placeholder="Ex: Ana — Suporte"
                  value={form.ai_persona_name}
                  onChange={e => setForm(f => ({ ...f, ai_persona_name: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">URL da Foto do Suporte</label>
                <input
                  className="form-input"
                  placeholder="https://... (opcional)"
                  value={form.ai_persona_avatar}
                  onChange={e => setForm(f => ({ ...f, ai_persona_avatar: e.target.value }))}
                />
              </div>
            </div>
            {form.ai_persona_name && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Preview no chat:</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {form.ai_persona_avatar ? (
                    <img src={form.ai_persona_avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 800 }}>
                      {form.ai_persona_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{form.ai_persona_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Olá! Fico feliz em ajudar. 😊</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <textarea
            className="form-input"
            rows={5}
            placeholder={defaultSystemPrompt}
            value={form.ai_system_prompt}
            onChange={e => setForm(f => ({ ...f, ai_system_prompt: e.target.value }))}
            style={{ resize: 'vertical', fontSize: 13 }}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? '⏳ Salvando...' : saved ? '✅ Salvo!' : '💾 Salvar Configurações'}
        </button>
      </form>
    </div>
  )
}
