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
    .from('webi_materials')
    .select('*')
    .eq('webinar_id', webinar_id)
    .order('show_at_seconds', { ascending: true })

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, label, url, icon, show_at_seconds } = body

    const supabase = getAnonClient()
    const { data, error } = await supabase
      .from('webi_materials')
      .insert({ webinar_id, label, url, icon: icon || '📄', show_at_seconds: show_at_seconds || 0 })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getAnonClient()
  await supabase.from('webi_materials').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
