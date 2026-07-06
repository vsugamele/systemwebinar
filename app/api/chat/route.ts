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
      const timestampVideo = typeof body.timestamp_video === 'number' ? body.timestamp_video : null
      await respondWithAI(webinar_id, session_id, text, message.author, timestampVideo).catch(err => {
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
async function respondWithAI(webinarId: string, userSessionId: string, questionText: string, userDisplayName?: string, timestampVideo?: number | null) {
  try {
    const supabase = await createServiceClient()

    // 1. Fetch webinar configuration
    const { data: webinar } = await supabase
      .from('webi_webinars')
      .select('name, ai_enabled, ai_persona_name, ai_persona_avatar, ai_model, ai_knowledge_base, ai_system_prompt, project_id, video_transcript, analytics_pitch_minute')
      .eq('id', webinarId)
      .single()

    if (!webinar || !webinar.ai_enabled) return

    // 2a. Lag/technical cooldown: if a lag-related AI response was already sent
    //     in the last 4 minutes for this webinar, skip — avoids flooding the chat
    //     when many users complain about buffering simultaneously.
    const lagKeywords = /lag|travando|travou|congelou|carregando|buffering|lento|caiu|caindo|não tá|nao ta|não está|nao esta|problema técnico|problema tecnico/i
    if (lagKeywords.test(questionText)) {
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString()
      const { data: recentLagReply } = await supabase
        .from('webi_live_chat')
        .select('id')
        .eq('webinar_id', webinarId)
        .like('session_id', 'ai-moderator:%')
        .or('text.ilike.%lag%,text.ilike.%travand%,text.ilike.%buffering%,text.ilike.%atualizar%,text.ilike.%F5%,text.ilike.%instabilidade%')
        .gte('created_at', fourMinutesAgo)
        .limit(1)
      if (recentLagReply && recentLagReply.length > 0) {
        // Already replied about lag recently — skip to avoid chat pollution
        return
      }
    }

    // 2. Fetch project OpenRouter API key
    const { data: project } = await supabase
      .from('webi_projects')
      .select('openrouter_api_key')
      .eq('id', webinar.project_id)
      .single()

    const apiKey = project?.openrouter_api_key
    if (!apiKey) return

    // 2b. Pitch restriction: if current video time is before the scheduled pitch,
    //     do not reveal price/links. Instead, reply with a friendly redirect message.
    const hasPitchConfig = typeof webinar.analytics_pitch_minute === 'number' && webinar.analytics_pitch_minute > 0
    if (hasPitchConfig && typeof timestampVideo === 'number') {
      const pitchSeconds = webinar.analytics_pitch_minute * 60
      if (timestampVideo < pitchSeconds) {
        const commercialKeywords = /preço|preco|valor|comprar|link|desconto|formação|formacao|matricula|matrícula|custa|custar|boleto|cartao|cartão|pagar|pagamento|cupom|investimento/i
        if (commercialKeywords.test(questionText)) {
          const aiName = webinar.ai_persona_name || '🤖 Assistente'
          const finalAnswer = userDisplayName?.trim() 
            ? `@${userDisplayName.trim()} O JP vai abrir as vagas e explicar todos os detalhes daqui a pouco na aula, fica ligada!`
            : `O JP vai abrir as vagas e explicar todos os detalhes daqui a pouco na aula, fica ligada!`

          // Save and broadcast directly without calling OpenRouter
          const aiSessionId = `ai-moderator:${userSessionId}`
          const { data: insertedRows } = await supabase.from('webi_live_chat').insert({
            webinar_id: webinarId,
            session_id: aiSessionId,
            author: aiName,
            text: finalAnswer,
            timestamp_video: timestampVideo,
            is_simulated: true,
            is_broadcast: false,
          }).select('id, created_at').single()

          try {
            const channel = supabase.channel(`webinar-${webinarId}`)
            await channel.send({
              type: 'broadcast',
              event: 'chat-message',
              payload: {
                id: insertedRows?.id ?? `ai-${Date.now()}`,
                session_id: aiSessionId,
                author: aiName,
                text: finalAnswer,
                timestamp: insertedRows?.created_at
                  ? Math.floor(new Date(insertedRows.created_at).getTime() / 1000)
                  : Math.floor(Date.now() / 1000),
                isSimulated: true,
                isBroadcast: false,
              },
            })
            await supabase.removeChannel(channel)
          } catch (broadcastErr) {
            console.error('Failed to broadcast friendly pitch restrict reply:', broadcastErr)
          }
          return
        }
      }
    }

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

    systemPrompt += `\n\nPROBLEMAS TÉCNICOS DE VÍDEO (lag, travamento, buffering, congelamento): Quando alguém reclamar que o vídeo está travando, com lag, carregando devagar, congelado ou com qualidade ruim, siga esta ordem: 1) Peça para aguardar alguns instantes, pois pode ser instabilidade momentânea na internet. 2) Se persistir, oriente a atualizar a página (F5 ou recarregar). 3) Se ainda assim não resolver, sugira trocar para uma rede mais estável (Wi-Fi ou dados móveis). Seja empática, rápida e não entre em pânico — transmissões ao vivo podem ter variações pontuais.`
    systemPrompt += `

FORMATO DA RESPOSTA: Seja concisa e direta. Responda em no máximo 3 frases curtas. NUNCA deixe uma frase no meio — sempre termine o pensamento completamente. Se precisar de mais espaço, reduza o número de informações mas SEMPRE complete a última frase.`

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
        max_tokens: 350,
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
    const aiSessionId = `ai-moderator:${userSessionId}`
    const { data: insertedRows, error: insertError } = await supabase.from('webi_live_chat').insert({
      webinar_id: webinarId,
      session_id: aiSessionId,
      author: aiName,
      text: finalAnswer,
      timestamp_video: 0,
      is_simulated: true,
      is_broadcast: false,
    }).select('id, created_at').single()
    if (insertError) {
      console.error('Failed to insert AI response into DB:', insertError)
    }

    // 7. Broadcast the AI message explicitly via Supabase Realtime so the client
    //    always receives it — postgres_changes events from server-side inserts
    //    can be filtered out by RLS for the anon role.
    try {
      const channel = supabase.channel(`webinar-${webinarId}`)
      await channel.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: {
          id: insertedRows?.id ?? `ai-${Date.now()}`,
          session_id: aiSessionId,
          author: aiName,
          text: finalAnswer,
          timestamp: insertedRows?.created_at
            ? Math.floor(new Date(insertedRows.created_at).getTime() / 1000)
            : Math.floor(Date.now() / 1000),
          isSimulated: true,
          isBroadcast: false,
        },
      })
      await supabase.removeChannel(channel)
    } catch (broadcastErr) {
      console.error('Failed to broadcast AI response:', broadcastErr)
    }
  } catch (err) {
    console.error('Error in background AI moderator:', err)
  }
}
