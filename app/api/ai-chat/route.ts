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
    const { question, webinar_id, session_id, history, overrides } = await req.json()
    if (!question || !webinar_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = getAnonClient()

    // Get webinar AI config + project openrouter key
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('name, ai_enabled, ai_model, ai_knowledge_base, ai_system_prompt, project_id, video_transcript')
      .eq('id', webinar_id)
      .single()

    const aiEnabled = overrides?.ai_enabled !== undefined ? overrides.ai_enabled : webinar?.ai_enabled
    if (!aiEnabled) {
      return NextResponse.json({ skip: true })
    }

    const { data: project } = await supabase
      .from('webi_projects')
      .select('openrouter_api_key')
      .eq('id', webinar?.project_id || '')
      .single()

    const apiKey = project?.openrouter_api_key
    if (!apiKey) {
      return NextResponse.json({ skip: true, reason: 'no_api_key' })
    }

    const model = overrides?.ai_model || webinar?.ai_model || 'google/gemini-flash-1.5'
    const knowledgeBase = overrides?.ai_knowledge_base !== undefined ? overrides.ai_knowledge_base : (webinar?.ai_knowledge_base || '')
    const transcript = overrides?.video_transcript !== undefined ? overrides.video_transcript : (webinar?.video_transcript || '')
    
    let systemPrompt = (overrides?.ai_system_prompt !== undefined ? overrides.ai_system_prompt : webinar?.ai_system_prompt) ||
      `Você é um assistente inteligente do webinar "${webinar?.name || 'Webinar'}". 
Responda dúvidas dos participantes de forma concisa, simpática e direta (máximo 2-3 frases).
Baseie suas respostas nas informações do produto/conteúdo e no roteiro do vídeo abaixo. Se não souber, diga "Boa pergunta! Fiquem atentos que o apresentador vai abordar isso!" e não invente informações.`

    if (knowledgeBase) {
      systemPrompt += `\n\nINFORMAÇÕES DO PRODUTO/WEBINAR:\n${knowledgeBase}`
    }

    if (transcript) {
      systemPrompt += `\n\nROTEIRO/TRANSCRIÇÃO DO VÍDEO DO EXPERT:\n${transcript}`
    }

    let historyMessages: { role: 'user' | 'assistant'; content: string }[] = []

    if (Array.isArray(history)) {
      historyMessages = history
    } else if (session_id) {
      // Fetch the last 10 messages from DB matching the session
      const { data: chatHistory } = await supabase
        .from('webi_live_chat')
        .select('session_id, text, created_at')
        .eq('webinar_id', webinar_id)
        .in('session_id', [session_id, `ai-moderator:${session_id}`])
        .order('created_at', { ascending: false })
        .limit(10)

      const reversedHistory = (chatHistory || []).reverse()
      historyMessages = reversedHistory.map((m) => ({
        role: m.session_id === session_id ? 'user' : 'assistant' as const,
        content: m.text,
      }))
    }

    // Construct final messages array
    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
    ]

    // Append current question if not already the last message
    if (historyMessages.length === 0 || historyMessages[historyMessages.length - 1].content !== question) {
      apiMessages.push({ role: 'user', content: question })
    }

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
        messages: apiMessages,
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
