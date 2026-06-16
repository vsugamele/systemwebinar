import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type RunStatus = 'active' | 'ended' | 'cancelled'

async function getWebinarContext(supabase: Awaited<ReturnType<typeof createServiceClient>>, webinarId: string) {
  const { data, error } = await supabase
    .from('webi_webinars')
    .select('id, project_id, name, current_run_id, session_started_at')
    .eq('id', webinarId)
    .single()

  if (error) throw error
  return data as {
    id: string
    project_id: string
    name: string
    current_run_id: string | null
    session_started_at: string | null
  } | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const webinarId = searchParams.get('webinar_id')
    if (!webinarId) {
      return NextResponse.json({ error: 'webinar_id required' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data: runs, error } = await supabase
      .from('webi_webinar_runs')
      .select('id, webinar_id, project_id, title, status, started_at, ended_at, metadata, created_at, updated_at')
      .eq('webinar_id', webinarId)
      .order('started_at', { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json({ runs: runs || [] })
  } catch (error) {
    console.error('Error in GET /api/webinar-runs:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const webinarId = body.webinar_id as string | undefined
    const action = body.action as 'start' | 'stop' | undefined

    if (!webinarId || !action) {
      return NextResponse.json({ error: 'webinar_id and action required' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const webinar = await getWebinarContext(supabase, webinarId)
    if (!webinar) {
      return NextResponse.json({ error: 'webinar not found' }, { status: 404 })
    }

    if (action === 'start') {
      const now = new Date().toISOString()

      if (webinar.current_run_id) {
        await supabase
          .from('webi_webinar_runs')
          .update({ status: 'ended' satisfies RunStatus, ended_at: now, updated_at: now })
          .eq('id', webinar.current_run_id)
          .eq('status', 'active')
      }

      const title = body.title || new Date(now).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })

      const { data: run, error: runError } = await supabase
        .from('webi_webinar_runs')
        .insert({
          webinar_id: webinar.id,
          project_id: webinar.project_id,
          title,
          status: 'active' satisfies RunStatus,
          started_at: now,
          metadata: body.metadata || {},
        })
        .select('id, title, status, started_at, ended_at')
        .single()

      if (runError) throw runError

      const { error: updateError } = await supabase
        .from('webi_webinars')
        .update({
          session_started_at: now,
          current_run_id: run.id,
          status: 'active',
        })
        .eq('id', webinar.id)

      if (updateError) throw updateError

      return NextResponse.json({ ok: true, run, session_started_at: now })
    }

    const now = new Date().toISOString()
    const runId = (body.run_id as string | undefined) || webinar.current_run_id

    if (runId) {
      const { error: runError } = await supabase
        .from('webi_webinar_runs')
        .update({ status: 'ended' satisfies RunStatus, ended_at: now, updated_at: now })
        .eq('id', runId)

      if (runError) throw runError
    }

    const { error: updateError } = await supabase
      .from('webi_webinars')
      .update({ session_started_at: null, current_run_id: null })
      .eq('id', webinar.id)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true, run_id: runId, ended_at: now })
  } catch (error) {
    console.error('Error in POST /api/webinar-runs:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

