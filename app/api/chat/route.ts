import { NextRequest, NextResponse } from 'next/server'
import { pusherServer } from '@/lib/pusher'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { webinar_id, session_id, ...message } = body

    // Broadcast to all clients in this webinar channel
    await pusherServer.trigger(`webinar-${webinar_id}`, 'chat-message', {
      ...message,
      session_id,
      id: Math.random().toString(36),
      isSimulated: false,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
