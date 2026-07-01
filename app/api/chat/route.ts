import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, session_id, run_id, ...message } = body

    if (!webinar_id) {
      return NextResponse.json({ error: 'Missing webinar_id' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // 1. Rate Limiting / Moderation could be performed here...

    // 2. Save directly to the database via Admin/Service role
    const { error: dbError } = await supabase.from('webi_live_chat').insert({
      webinar_id,
      run_id: typeof run_id === 'string' ? run_id : null,
      session_id,
      author: message.author,
      text: message.text,
      timestamp_video: message.timestamp,
      is_simulated: false,
      is_broadcast: false,
    })

    if (dbError) {
      console.error('Could not insert chat message to DB:', dbError.message, dbError.code)
    }

    // Trigger AI response in the background if the message is a question
    const text = message.text || ''
    const isQ = text.endsWith('?') || /como|quando|qual|quanto|posso|consigo|funciona|o que|por que|porque|dúvida|ajuda|não entendi/i.test(text)
    if (isQ) {
      respondWithAI(webinar_id, session_id, text, message.author).catch(err => {
        console.error('Error initiating background AI response:', err)
      })
    }

    // 3. Trigger Realtime Broadcast via REST
    const channel = supabase.channel(`webinar-${webinar_id}`)
    
    let broadcastResponse: any = 'error'
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 3000)
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            resolve()
          }
        })
      })

      broadcastResponse = await channel.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: {
          ...message,
          session_id,
          isSimulated: false,
        }
      })
    } catch (err) {
      console.warn('Failed to subscribe and broadcast chat message:', err)
    } finally {
      // Cleanup the channel resource
      await supabase.removeChannel(channel)
    }

    if (broadcastResponse !== 'ok') {
      // Broadcast is best-effort — the message was already saved to the DB.
      // Other users will receive it via the postgres_changes realtime subscription.
      console.warn('Chat Broadcast non-ok (message saved to DB):', broadcastResponse)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Chat API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Background AI response helper function
async function respondWithAI(webinarId: string, userSessionId: string, questionText: string, userDisplayName?: string) {
  try {
    const supabase = await createServiceClient()

    // 1. Fetch webinar configuration
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('name, ai_enabled, ai_persona_name, ai_persona_avatar, ai_model, ai_knowledge_base, ai_system_prompt, project_id, video_transcript')
      .eq('id', webinarId)
      .single()

    if (!webinar || !webinar.ai_enabled) return

    // 2. Fetch project OpenRouter API key
    const { data: project } = await supabase
      .from('webi_projects')
      .select('openrouter_api_key')
      .eq('id', webinar.project_id)
      .single()

    const apiKey = project?.openrouter_api_key
    if (!apiKey) return

    // 3. Prepare AI system prompt and model
    const model = webinar.ai_model || 'google/gemini-flash-1.5'
    const knowledgeBase = webinar.ai_knowledge_base || ''
    const transcript = webinar.video_transcript || ''
    
    let systemPrompt = webinar.ai_system_prompt ||
      `Você é um membro da equipe de suporte do webinar "${webinar.name}".
Responda às dúvidas dos participantes de forma 100% natural, conversacional e direta, como se fosse um humano real digitando rapidamente.

Siga estas diretrizes de escrita estritas:
1. Converse como uma pessoa de verdade: use artigos e conectivos completos (evite cortar termos para parecer direto, pois soa robótico/tradução de IA).
2. Não use títulos de blocos (como "Problema:", "Solução:") nem formatações artificiais como tópicos com marcadores/bullets (• ou 1.), a menos que seja estritamente necessário.
3. Remova adjetivos vagos ("muito bom", "extremamente prático") e substitua por fatos ou dê contexto direto aos números.
4. Se precisar direcionar o usuário para alguma ação, faça um convite fluido que continue o fluxo da conversa natural.
5. Baseie suas respostas unicamente nas informações do produto/conteúdo e no roteiro do vídeo fornecidos abaixo.`

    if (knowledgeBase) {
      systemPrompt += `\n\nINFORMAÇÕES DO PRODUTO/WEBINAR:\n${knowledgeBase}`
    }

    if (transcript) {
      systemPrompt += `\n\nROTEIRO/TRANSCRIÇÃO DO VÍDEO DO EXPERT:\n${transcript}`
    }

    systemPrompt += `\n\nDIRETRIZ DE SEGURANÇA E ESCAPE: Se você não souber a resposta com absoluta certeza com base apenas nas informações fornecidas acima, ou se a pergunta for vaga/desconexa, responda APENAS com a palavra "PULAR" (sem aspas, sem pontuação, sem explicações). Não invente nenhuma informação.`

    // 4. Fetch the last 10 messages from the database matching the user's session for context
    const { data: chatHistory } = await supabase
      .from('webi_live_chat')
      .select('session_id, text, created_at')
      .eq('webinar_id', webinarId)
      .in('session_id', [userSessionId, `ai-moderator:${userSessionId}`])
      .order('created_at', { ascending: false })
      .limit(10)

    const reversedHistory = (chatHistory || []).reverse()
    const historyMessages = reversedHistory.map((m) => ({
      role: (m.session_id === userSessionId ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }))

    // Construct final prompt messages
    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
    ]

    // To prevent race conditions, if the latest message isn't in history yet, append it
    if (historyMessages.length === 0 || historyMessages[historyMessages.length - 1].content !== questionText) {
      apiMessages.push({ role: 'user', content: questionText })
    }

    // 5. Request completion from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://webinarflow.app',
        'X-Title': 'WebinarFlow AI Chat',
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      console.error('OpenRouter failed in background AI moderator:', await response.text())
      return
    }

    const resData = await response.json()
    const answer = resData.choices?.[0]?.message?.content?.trim()
    if (!answer || answer.toUpperCase() === 'PULAR' || answer.toUpperCase().includes('PULAR')) return

    const aiName = webinar.ai_persona_name || '🤖 Assistente'
    const aiAvatar = webinar.ai_persona_avatar || ''

    let finalAnswer = answer
    if (userDisplayName) {
      const cleanName = userDisplayName.trim()
      if (cleanName && !answer.startsWith('@') && !answer.includes(cleanName)) {
        finalAnswer = `@${cleanName} ${answer}`
      }
    }

    // 6. Insert AI response into the database with prefixed session_id
    await supabase.from('webi_live_chat').insert({
      webinar_id: webinarId,
      session_id: `ai-moderator:${userSessionId}`,
      author: aiName,
      avatar: aiAvatar || null,
      text: finalAnswer,
      timestamp_video: 0,
      is_simulated: true,
      is_broadcast: false,
    })
  } catch (err) {
    console.error('Error in background AI moderator:', err)
  }
}
