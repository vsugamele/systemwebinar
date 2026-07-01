import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { script, projectId } = await req.json()
    if (!script || !projectId) {
      return NextResponse.json({ error: 'Faltam campos obrigatórios' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Resgatar API Key do Projeto
    const { data: project } = await supabase
      .from('webi_projects')
      .select('openrouter_api_key')
      .eq('id', projectId)
      .single()

    const apiKey = project?.openrouter_api_key
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chave do OpenRouter não configurada nos Ajustes do Projeto.' },
        { status: 400 }
      )
    }

    const systemPrompt = `Você é um Estrategista de Webinars responsável por construir o chat "falso" perfeito de uma live gravada. 
Eu lhe darei um ROTEIRO/TOPICOS do apresentador.
Sua tarefa é retornar um JSON puro que simule as expectativas da audiência, nomes citados, momentos certos de elogiar e momentos certos de euforia e vendas.

RETORNE EXATAMENTE APENAS O JSON, SEM MARKDOWN, SEM EXPLICAÇÕES, COM A SEGUINTE ESTRUTURA E REGRAS:
{
  "names": [ "lista com uns 15 nomes em português usando as características ou nomes citados no roteiro, ou apenas nomes críveis brasileiros" ],
  "phrasesMix": [ "lista de ~15 frases aleatórias gerais sobre estarem ali no evento" ],
  "phrasesElogios": [ "lista de ~10 frases de alunos gostando da aula especificando pontos falados no roteiro" ],
  "phrasesEngajamento": [ "lista de ~10 frases de respostas e interações pedidas pelo apresentador no roteiro. Ex: se ele perguntar cidade, responda 'Rio de Janeiro', 'Sou do Sul', se ele pedir 'Diga EU', responda 'EU'" ],
  "phrasesVaga": [ "lista de ~10 frases de compra de curso/escassez no fim do webinário, como 'Estou dentro', 'Já garanti a minha'" ],
  "segments": [
    { "from": 0, "to": 900, "cpm": 4, "phrases": "mix", "reason": "Pessoas chegando" },
    { "from": 900, "to": 2000, "cpm": 10, "phrases": "engajamento", "reason": "Apresentador pede interação" },
    { "from": 2000, "to": null, "cpm": 25, "phrases": "vaga", "reason": "Abertura de carrinho e picos de emoção" }
  ]
}

A array de 'segments' deve refletir a provável minutagem do roteiro, com from e to sendo valores amigáveis em segundos (ex: 20 min = 1200). 
Se não houver minutagem, crie de forma genérica em passagens lógicas curtas e uma grande pra encerramento.
Nunca retorne chaves faltando. Para os values do phrases nos segments, DEVE SER EXATAMENTE UM DESSES: "mix", "elogios", "vaga", "engajamento", ou nulo.
`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://webinarflow.app',
        'X-Title': 'WebinarFlow AI Simulator Builder',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `ROTEIRO PARA ANÁLISE:\n\n${script}` }
        ],
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenRouter error:', err)
      return NextResponse.json({ error: 'Ocorreu um erro na API da inteligência artificial.' }, { status: 500 })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return NextResponse.json({ error: 'Resposta em branco da inteligência artificial.' }, { status: 500 })
    }

    // Try to parse JSON securely
    let jsonMatch = content
    if (content.startsWith('```json')) {
       jsonMatch = content.replace(/```json/g, '').replace(/```/g, '').trim()
    } else if (content.startsWith('```')) {
       jsonMatch = content.replace(/```/g, '').trim()
    }

    try {
      const parsed = JSON.parse(jsonMatch)
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ error: 'Formato de resposta inesperado retornado pela IA.', raw: jsonMatch }, { status: 500 })
    }
  } catch (error) {
    console.error('AI script error:', error)
    return NextResponse.json({ error: 'Erro interno no processamento.' }, { status: 500 })
  }
}
