/**
 * Imperio HQ webhook integration helper.
 * Fires event data to the Imperio CRM for lead enrichment.
 */

const IMPERIO_ENDPOINT = 'https://tkbivipqiewkfnhktmqq.supabase.co/functions/v1/membros-webhook'

export interface ImperioPayload {
  project_id: string
  event_type: string
  email?: string
  nome?: string
  phone?: string
  origem?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  respostas?: unknown
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  page_url?: string
}

/**
 * Fire-and-forget: dispatches an event to the Imperio HQ webhook.
 * Errors are swallowed to never block main flows.
 */
export function imperioSend(payload: ImperioPayload): void {
  if (!payload.project_id) return // skip if not configured

  fetch(IMPERIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((e) => console.warn('[Imperio HQ]', e))
}

export async function enviarParaImperio(
  eventType: string,
  projectId: string,
  dadosLead: { email?: string; nome?: string; phone?: string },
  extras: {
    origem?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    respostas?: any;
    page_url?: string;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
  } = {}
) {
  try {
    let utm_source = extras.utm_source;
    let utm_medium = extras.utm_medium;
    let utm_campaign = extras.utm_campaign;
    let page_url = extras.page_url;

    // Se estiver no client-side e não tiver passado as UTMs/URL explicitamente, tenta pegar do browser
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      if (!utm_source) utm_source = searchParams.get("utm_source") || searchParams.get("utm") || null;
      if (!utm_medium) utm_medium = searchParams.get("utm_medium") || null;
      if (!utm_campaign) utm_campaign = searchParams.get("utm_campaign") || null;
      if (!page_url) page_url = window.location.href;
    }

    await fetch(IMPERIO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        event_type: eventType,
        email: dadosLead.email,
        nome: dadosLead.nome,
        phone: dadosLead.phone,
        origem: extras.origem || "area-membros",
        tags: extras.tags || [],
        metadata: extras.metadata || {},
        respostas: extras.respostas,
        utm_source,
        utm_medium,
        utm_campaign,
        page_url,
      }),
    });
  } catch (e) {
    console.error("Imperio HQ:", e);
  }
}
