import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const QUESTION_KEYWORDS = [
  '?', 'como', 'quando', 'onde', 'qual', 'quanto', 'por que', 'porque',
  'o que', 'posso', 'funciona', 'tem', 'existe', 'dá pra', 'consigo',
  'me explica', 'não entendi', 'dúvida', 'pergunta', 'ajuda'
]

export function isQuestion(text: string): boolean {
  const lower = text.toLowerCase()
  return QUESTION_KEYWORDS.some(k => lower.includes(k))
}

export async function POST(req: NextRequest) {
  try {
    const { question, webinar_id } = await req.json()
    if (!question || !webinar_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = getAnonClient()

    // Get webinar AI config + project openrouter key
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('name, ai_enabled, ai_model, ai_knowledge_base, ai_system_prompt, project_id')
      .eq('id', webinar_id)
      .single()

    if (!webinar?.ai_enabled) {
      return NextResponse.json({ skip: true })
    }

    const { data: project } = await supabase
      .from('webi_projects')
      .select('openrouter_api_key')
      .eq('id', webinar.project_id)
      .single()

    const apiKey = project?.openrouter_api_key
    if (!apiKey) {
      return NextResponse.json({ skip: true, reason: 'no_api_key' })
    }

    const model = webinar.ai_model || 'google/gemini-flash-1.5'
    const knowledgeBase = webinar.ai_knowledge_base || ''
    const systemPrompt = webinar.ai_system_prompt ||
      `Você é um assistente inteligente do webinar "${webinar.name}". 
Responda dúvidas dos participantes de forma concisa, simpática e direta (máximo 2-3 frases).
Baseie suas respostas nas informações do produto/conteúdo abaixo. Se não souber, diga "Boa pergunta! Fiquem atentos que o apresentador vai abordar isso!" e não invente informações.

INFORMAÇÕES DO PRODUTO/WEBINAR:
${knowledgeBase || 'Webinar ao vivo. Sem informações adicionais configuradas.'}`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://webinarflow.app',
        'X-Title': 'WebinarFlow AI Chat',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenRouter error:', err)
      return NextResponse.json({ skip: true, reason: 'api_error' })
    }

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content?.trim()

    if (!answer) return NextResponse.json({ skip: true })

    return NextResponse.json({ answer })
  } catch (error) {
    console.error('AI chat error:', error)
    return NextResponse.json({ skip: true })
  }
}
