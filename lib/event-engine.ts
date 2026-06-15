import { WebinarEvent, EventType } from '@/types'

export interface FiredEvent {
  id: string
  fired: boolean
}

export type EventHandler = (event: WebinarEvent) => void

export class EventEngine {
  private events: (WebinarEvent & { fired: boolean })[]
  private handlers: Map<EventType, EventHandler[]>

  constructor(events: WebinarEvent[]) {
    this.events = events
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
      .map(e => ({ ...e, fired: false }))
    this.handlers = new Map()
  }

  on(type: EventType, handler: EventHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, [])
    }
    this.handlers.get(type)!.push(handler)
    return this
  }

  tick(currentSeconds: number) {
    this.events.forEach(event => {
      if (!event.fired && currentSeconds >= event.timestamp_seconds) {
        event.fired = true
        const handlers = this.handlers.get(event.type) || []
        handlers.forEach(h => h(event))
      }
    })
  }

  reset() {
    this.events.forEach(e => (e.fired = false))
  }

  seek(seconds: number) {
    this.events.forEach(e => {
      e.fired = e.timestamp_seconds < seconds
    })
  }
}
