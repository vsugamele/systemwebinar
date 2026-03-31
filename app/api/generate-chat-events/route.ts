import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export interface GeneratedChatEvent {
  timestamp_seconds: number
  author: string
  text: string
}

export async function POST(req: NextRequest) {
  try {
    const { webinar_id, script, count = 20, duration_seconds } = await req.json()

    if (!webinar_id || !script) {
      return NextResponse.json({ error: 'webinar_id e script são obrigatórios' }, { status: 400 })
    }

    const supabase = getAnonClient()

    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('name, ai_model, project_id, duration_seconds, chat_names')
      .eq('id', webinar_id)
      .single()

    if (!webinar) {
      return NextResponse.json({ error: 'Webinar não encontrado' }, { status: 404 })
    }

    const { data: project } = await supabase
      .from('webi_projects')
      .select('openrouter_api_key')
      .eq('id', webinar.project_id)
      .single()

    const apiKey = project?.openrouter_api_key
    if (!apiKey) {
      return NextResponse.json({ error: 'Configure a chave OpenRouter nas configurações de IA do webinar.' }, { status: 400 })
    }

    const durationSecs = duration_seconds || webinar.duration_seconds || 3600
    const durationMin = Math.round(durationSecs / 60)
    const model = webinar.ai_model || 'google/gemini-flash-1.5'

    const namesPool: string[] = Array.isArray(webinar.chat_names) && webinar.chat_names.length > 0
      ? webinar.chat_names as string[]
      : ['Maria S.', 'João P.', 'Ana C.', 'Carlos M.', 'Luciana F.', 'Pedro R.', 'Fernanda A.', 'Rafael B.', 'Camila T.', 'Bruno L.']

    const systemPrompt = `Você é um especialista em criar engajamento realista em webinars ao vivo.
Sua tarefa é gerar mensagens de chat autênticas que participantes reais escreveriam durante o webinar.

REGRAS:
- Mensagens curtas (máximo 1-2 frases), naturais, em português brasileiro informal
- Variar entre: reações de espanto/empolgação, confirmações ("Nossa!", "Faz sentido!", "Que incrível!"), perguntas relevantes ao conteúdo, insights pessoais ("Isso aconteceu comigo!"), pedidos ("Pode repetir?", "Consegui entender")
- Distribuir os timestamps proporcionalmente ao longo do webinar
- Cada mensagem deve COMBINAR com o que está sendo apresentado naquele momento do roteiro
- NÃO usar emojis no texto (apenas ocasionalmente e com moderação)

RETORNE APENAS um JSON array válido, sem markdown, sem explicações. Formato exato:
[{"timestamp_seconds": 90, "author": "Maria S.", "text": "Nossa, nunca pensei assim!"}]`

    const userPrompt = `Webinar: "${webinar.name}"
Duração total: ${durationMin} minutos (${durationSecs} segundos)
Quantidade de mensagens a gerar: ${count}

Nomes disponíveis para usar (varie entre eles): ${namesPool.slice(0, 15).join(', ')}

ROTEIRO DO WEBINAR:
${script}

Gere exatamente ${count} mensagens de chat distribuídas ao longo do webinar, alinhadas com o conteúdo em cada momento. Retorne apenas o JSON array.`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://webinarflow.app',
        'X-Title': 'WebinarFlow Chat Generator',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.85,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenRouter error:', err)
      return NextResponse.json({ error: 'Erro ao chamar OpenRouter. Verifique sua chave de API.' }, { status: 502 })
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content?.trim()

    if (!raw) {
      return NextResponse.json({ error: 'IA não retornou resposta.' }, { status: 502 })
    }

    let events: GeneratedChatEvent[]
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
      events = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse AI response:', raw)
      return NextResponse.json({ error: 'IA retornou formato inválido. Tente novamente.' }, { status: 502 })
    }

    // Validate and clamp timestamps
    events = events
      .filter(e => e.author && e.text && typeof e.timestamp_seconds === 'number')
      .map(e => ({
        timestamp_seconds: Math.max(0, Math.min(Math.round(e.timestamp_seconds), durationSecs)),
        author: String(e.author).slice(0, 50),
        text: String(e.text).slice(0, 300),
      }))
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Generate chat events error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
