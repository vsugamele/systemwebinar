import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(req: NextRequest) {
  const webinar_id = req.nextUrl.searchParams.get('webinar_id')
  if (!webinar_id) return NextResponse.json([])

  const supabase = getAnonClient()
  const { data } = await supabase
    .from('webi_testimonials')
    .select('*')
    .eq('webinar_id', webinar_id)
    .eq('approved', true)
    .order('show_at_seconds', { ascending: true })

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, name, role, text, rating } = body

    const supabase = getAnonClient()
    const { error } = await supabase
      .from('webi_testimonials')
      .insert({ webinar_id, name, role, text, rating: rating || 5, approved: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
