'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface WebinarStats {
  id: string
  name: string
  slug: string
  leads: number
  joined: number
  watched50: number
  ctaClicked: number
  certificates: number
  convRate: number
}

interface ProjectInfo {
  name: string
  brand_color: string
}

function FunnelBar({ label, value, max, color, sublabel }: {
  label: string
  value: number
  max: number
  color: string
  sublabel: string
}) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <strong style={{ color, fontSize: 16 }}>{value.toLocaleString()}</strong>
          {' '}· {sublabel}
        </span>
      </div>
      <div style={{ height: 10, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 99,
          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: `0 0 8px ${color}60`,
        }} />
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const { id } = useParams() as { id: string }
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [webinars, setWebinars] = useState<WebinarStats[]>([])
  const [selectedWid, setSelectedWid] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // Fetch project info
      const { data: proj } = await supabase
        .from('webi_projects')
        .select('name, brand_color')
        .eq('id', id)
        .single()
      setProject(proj)

      // Fetch all webinars for this project
      const { data: wlist } = await supabase
        .from('webi_webinars')
        .select('id, name, slug')
        .eq('project_id', id)
        .order('created_at', { ascending: false })

      if (!wlist || wlist.length === 0) { setLoading(false); return }

      // Fetch stats for each webinar in parallel
      const stats: WebinarStats[] = await Promise.all(wlist.map(async (w) => {
        const wid = w.id

        // Leads count
        const { count: leads } = await supabase
          .from('webi_leads')
          .select('*', { count: 'exact', head: true })
          .eq('webinar_id', wid)

        // Joined sessions (unique)
        const { data: joinedData } = await supabase
          .from('webi_session_events')
          .select('session_id')
          .eq('webinar_id', wid)
          .eq('event_type', 'joined')

        const joined = new Set(joinedData?.map(x => x.session_id) || []).size

        // Watched 50%+ (unique session_ids with progress event)
        const { data: watched50Data } = await supabase
          .from('webi_session_events')
          .select('session_id')
          .eq('webinar_id', wid)
          .eq('event_type', 'progress_50')

        const watched50 = new Set(watched50Data?.map(x => x.session_id) || []).size

        // CTA clicked (unique session_ids)
        const { data: ctaData } = await supabase
          .from('webi_session_events')
          .select('session_id')
          .eq('webinar_id', wid)
          .eq('event_type', 'cta_clicked')

        const ctaClicked = new Set(ctaData?.map(x => x.session_id) || []).size

        // Certificates (quiz responses with score >= 70)
        const { count: certificates } = await supabase
          .from('webi_quiz_responses')
          .select('*', { count: 'exact', head: true })
          .eq('webinar_id', wid)
          .gte('score_percent', 70)

        const convRate = (leads ?? 0) > 0
          ? Math.round(((ctaClicked) / (leads ?? 1)) * 100)
          : 0

        return {
          id: wid,
          name: w.name,
          slug: w.slug,
          leads: leads ?? 0,
          joined,
          watched50,
          ctaClicked,
          certificates: certificates ?? 0,
          convRate,
        }
      }))

      setWebinars(stats)
      if (stats.length > 0) setSelectedWid(stats[0].id)
      setLoading(false)
    }
    load()
  }, [id])

  const selected = webinars.find(w => w.id === selectedWid)
  const brandColor = project?.brand_color || '#6366f1'

  // Summary totals
  const totals = webinars.reduce((acc, w) => ({
    leads: acc.leads + w.leads,
    joined: acc.joined + w.joined,
    ctaClicked: acc.ctaClicked + w.ctaClicked,
    certificates: acc.certificates + w.certificates,
  }), { leads: 0, joined: 0, ctaClicked: 0, certificates: 0 })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        Carregando analytics...
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
            <Link href="/admin/projects" style={{ color: 'var(--text-muted)' }}>Projetos</Link>
            {' / '}{project?.name}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📊 Analytics &amp; Funil</h1>
        </div>
        <Link href={`/admin/projects/${id}`} className="btn btn-ghost btn-sm">← Projeto</Link>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { icon: '👤', label: 'Total de Leads', value: totals.leads, color: '#22c55e' },
          { icon: '▶️', label: 'Entraram na Sala', value: totals.joined, color: '#3b82f6' },
          { icon: '🖱️', label: 'Clicaram no CTA', value: totals.ctaClicked, color: brandColor },
          { icon: '🎓', label: 'Certificados', value: totals.certificates, color: '#f59e0b' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-card)',
            border: `1px solid ${card.color}30`,
            borderRadius: 16, padding: 20,
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: card.color }}>
              {card.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: webinars.length > 1 ? '220px 1fr' : '1fr', gap: 24 }}>
        {/* Webinar selector sidebar */}
        {webinars.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Webinars
            </div>
            {webinars.map(w => (
              <button
                key={w.id}
                onClick={() => setSelectedWid(w.id)}
                style={{
                  background: selectedWid === w.id ? `${brandColor}15` : 'var(--bg-card)',
                  border: `1px solid ${selectedWid === w.id ? brandColor + '50' : 'var(--border)'}`,
                  borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: selectedWid === w.id ? brandColor : 'var(--text-primary)', marginBottom: 2 }}>
                  {w.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {w.leads} leads · {w.convRate}% conv.
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Funnel detail */}
        {selected && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{selected.name}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Funil de Conversão
                </div>
              </div>
              <div style={{
                background: `${brandColor}15`, border: `1px solid ${brandColor}40`,
                borderRadius: 99, padding: '6px 16px', fontSize: 13, fontWeight: 700, color: brandColor,
              }}>
                {selected.convRate}% taxa de conversão
              </div>
            </div>

            <FunnelBar
              label="📋 Cadastros (Leads)"
              value={selected.leads}
              max={Math.max(selected.leads, 1)}
              color="#22c55e"
              sublabel="100% da base"
            />
            <FunnelBar
              label="▶️ Entraram na Sala"
              value={selected.joined}
              max={Math.max(selected.leads, 1)}
              color="#3b82f6"
              sublabel={`${selected.leads > 0 ? Math.round((selected.joined / selected.leads) * 100) : 0}% dos leads`}
            />
            <FunnelBar
              label="⏱ Assistiram 50%+"
              value={selected.watched50}
              max={Math.max(selected.leads, 1)}
              color={brandColor}
              sublabel={`${selected.joined > 0 ? Math.round((selected.watched50 / selected.joined) * 100) : 0}% dos que entraram`}
            />
            <FunnelBar
              label="🖱️ Clicaram no CTA"
              value={selected.ctaClicked}
              max={Math.max(selected.leads, 1)}
              color="#f97316"
              sublabel={`${selected.watched50 > 0 ? Math.round((selected.ctaClicked / selected.watched50) * 100) : 0}% dos que assistiram 50%`}
            />
            <FunnelBar
              label="🎓 Baixaram Certificado"
              value={selected.certificates}
              max={Math.max(selected.leads, 1)}
              color="#f59e0b"
              sublabel={`${selected.leads > 0 ? Math.round((selected.certificates / selected.leads) * 100) : 0}% dos leads`}
            />

            {/* Drop-off insights */}
            <div style={{
              marginTop: 24,
              padding: 16,
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>💡 Insights</div>
              {selected.leads === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ainda sem leads registrados neste webinar.</div>
              )}
              {selected.leads > 0 && selected.joined < selected.leads * 0.5 && (
                <div style={{ fontSize: 13, color: '#f59e0b', marginBottom: 6 }}>
                  ⚠️ Menos de 50% dos leads entrou na sala. Considere reforçar os lembretes por e-mail.
                </div>
              )}
              {selected.joined > 0 && selected.watched50 < selected.joined * 0.4 && (
                <div style={{ fontSize: 13, color: '#f97316', marginBottom: 6 }}>
                  ⚠️ Muitos saem antes dos 50%. Revise o conteúdo do início do webinar.
                </div>
              )}
              {selected.watched50 > 0 && selected.ctaClicked < selected.watched50 * 0.1 && (
                <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 6 }}>
                  🔴 Baixa taxa de clique no CTA mesmo entre quem assistiu 50%+. Revise a oferta ou o timing.
                </div>
              )}
              {selected.convRate >= 5 && (
                <div style={{ fontSize: 13, color: '#22c55e' }}>
                  ✅ Boa taxa de conversão! Considere aumentar o tráfego para este webinar.
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={`/admin/projects/${id}/webinars/${selected.id}/events`} className="btn btn-secondary btn-sm">
                ⚡ Configurar Eventos
              </Link>
              <Link href={`/w/${selected.slug}?test=1`} target="_blank" className="btn btn-ghost btn-sm">
                ▶ Testar Webinar
              </Link>
            </div>
          </div>
        )}

        {webinars.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', gridColumn: '1/-1' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            Nenhum webinar encontrado neste projeto.
          </div>
        )}
      </div>
    </div>
  )
}
