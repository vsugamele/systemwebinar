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
      id: message.id,
      webinar_id,
      session_id,
      author: message.author,
      text: message.text,
      timestamp_video: message.timestamp,
      is_simulated: false,
      is_broadcast: false,
    })

    if (dbError && dbError.code !== '42P01') {
      console.warn('Could not insert chat message to DB:', dbError.message)
    }

    // 3. Trigger Realtime Broadcast via REST
    const channel = supabase.channel(`webinar-${webinar_id}`)
    const broadcastResponse = await channel.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: {
        ...message,
        session_id,
        isSimulated: false,
      }
    })

    // Cleanup the channel resource
    await supabase.removeChannel(channel)

    if (broadcastResponse !== 'ok') {
      console.error('Chat Broadcast Error:', broadcastResponse)
      return NextResponse.json({ error: `Broadcast failed with status: ${broadcastResponse}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Chat API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
