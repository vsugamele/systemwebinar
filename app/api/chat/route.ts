import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, session_id, ...message } = body

    if (!webinar_id) {
      return NextResponse.json({ error: 'Missing webinar_id' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // 1. Rate Limiting / Moderation could be performed here...

    // 2. Save directly to the database via Admin/Service role
    const { error: dbError } = await supabase.from('webi_live_chat').insert({
      webinar_id,
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
