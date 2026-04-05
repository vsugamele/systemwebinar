'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'

export default function TrackingPage() {
  const { id: projectId, wid: webinarId } = useParams<{ id: string; wid: string }>()
  const supabase = createClient()
  const [webinarName, setWebinarName] = useState('')
  const [headCode, setHeadCode] = useState('')
  const [bodyCode, setBodyCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('webi_webinars')
        .select('name, tracking_head_code, tracking_body_code')
        .eq('id', webinarId)
        .single()
      if (data) {
        setWebinarName(data.name)
        setHeadCode(data.tracking_head_code || '')
        setBodyCode(data.tracking_body_code || '')
      }
      setLoading(false)
    }
    load()
  }, [webinarId])

  async function save() {
    setSaving(true)
    await supabase.from('webi_webinars').update({
      tracking_head_code: headCode || null,
      tracking_body_code: bodyCode || null,
    }).eq('id', webinarId)
    setSaving(false)
    toast.success('Códigos de rastreamento salvos!')
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href={`/admin/projects/${projectId}/webinars`} style={{ color: 'var(--brand-light)' }}>Webinars</Link> / {webinarName}
          </div>
          <h1 className="page-title">🎯 Integrações & Tracking</h1>
          <p className="page-subtitle">Cole aqui seus códigos de rastreamento: Facebook Pixel, Google Analytics, GTM, etc.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="spinner" /> : '💾 Salvar'}
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Info box */}
        <div style={{
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Os códigos serão injetados em <strong style={{ color: 'var(--text-primary)' }}>todas as páginas públicas</strong> deste webinar:
            página de registro, sala ao vivo e sala de replay.
            Use o campo <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4 }}>&lt;head&gt;</code> para pixeis e analytics e o campo <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4 }}>&lt;body&gt;</code> para tags de conversão/noscript.
          </div>
        </div>

        {/* Head tracking */}
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📄 Código no &lt;head&gt;</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Ideal para: Facebook Pixel (init), Google Analytics (gtag.js), Google Tag Manager (head snippet), Hotjar.
            </div>
          </div>
          <textarea
            className="form-input form-textarea"
            style={{ minHeight: 180, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
            placeholder={`<!-- Facebook Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)...
  fbq('init', 'SEU_PIXEL_ID');
  fbq('track', 'PageView');
</script>`}
            value={headCode}
            onChange={e => setHeadCode(e.target.value)}
          />
        </div>

        {/* Body tracking */}
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📄 Código no &lt;body&gt;</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Ideal para: &lt;noscript&gt; do Facebook Pixel, tags de conversão (Google Ads), TikTok Pixel body snippet.
            </div>
          </div>
          <textarea
            className="form-input form-textarea"
            style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
            placeholder={`<noscript>
  <img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=SEU_PIXEL_ID&ev=PageView&noscript=1"/>
</noscript>`}
            value={bodyCode}
            onChange={e => setBodyCode(e.target.value)}
          />
        </div>

        {/* Preview toggles */}
        <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>📋 Páginas onde será injetado</div>
            {[
              { label: 'Página de Registro', url: `/register/${webinarId}` },
              { label: 'Sala Ao Vivo', url: `/w/[slug]` },
              { label: 'Sala de Replay', url: `/replay/[slug]` },
            ].map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: 'var(--success)', fontSize: 14 }}>✓</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.label}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>🟢 Status</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className={`badge ${headCode ? 'badge-active' : 'badge-draft'}`}>
                {headCode ? '● HEAD ativo' : '○ HEAD vazio'}
              </span>
              <span className={`badge ${bodyCode ? 'badge-active' : 'badge-draft'}`}>
                {bodyCode ? '● BODY ativo' : '○ BODY vazio'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
