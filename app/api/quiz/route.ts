import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, lead_email, lead_name, answers, score, total } = body

    const supabase = getAnonClient()

    const { data, error } = await supabase
      .from('webi_quiz_responses')
      .insert({ webinar_id, lead_email, lead_name, answers, score, total })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, response_id: data.id })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const webinar_id = req.nextUrl.searchParams.get('webinar_id')
  if (!webinar_id) return NextResponse.json([])

  const supabase = getAnonClient()
  const { data } = await supabase
    .from('webi_quiz_questions')
    .select('*')
    .eq('webinar_id', webinar_id)
    .order('sort_order', { ascending: true })

  return NextResponse.json(data || [])
}
