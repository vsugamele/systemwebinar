export type WebinarStatus = 'draft' | 'active' | 'paused'
export type EventType = 'chat_message' | 'offer_popup' | 'pitch_button' | 'hide_pitch_button' | 'email_auto'
export type SessionEventType = 'joined' | 'watch_second' | 'cta_clicked' | 'cta_dismissed' | 'popup_seen' | 'popup_dismissed' | 'left' | 'chat_sent'

export interface Project {
  id: string
  owner_id: string
  name: string
  logo_url: string | null
  accent_color: string
  custom_domain: string | null
  resend_from_email: string | null
  created_at: string
  updated_at: string
}

export interface Webinar {
  id: string
  project_id: string
  name: string
  description: string | null
  video_url: string | null
  thumbnail_url: string | null
  slug: string
  status: WebinarStatus
  evergreen_offset_seconds: number
  peak_viewers_min: number
  peak_viewers_max: number
  duration_seconds: number | null
  created_at: string
  updated_at: string
  // Session clock (004)
  session_started_at: string | null
  // Viewer curve (004)
  fake_viewers_start: number
  fake_viewers_peak: number
  fake_viewers_end: number
  fake_viewers_peak_at_pct: number
  // Chat (004)
  chat_default_tab: 'chat' | 'qa'
}

// ---- Event Payloads ----

export interface ChatMessagePayload {
  author: string
  avatar?: string
  text: string
}

export interface OfferPopupPayload {
  title: string
  subtitle?: string
  image_url?: string
  cta_text: string
  cta_url: string
  duration_seconds: number
}

export interface PitchButtonPayload {
  image_url?: string
  cta_text: string
  cta_url: string
  exit_at_seconds?: number
}

export interface EmailAutoPayload {
  template: string
  delay_minutes: number
}

export type EventPayload =
  | ChatMessagePayload
  | OfferPopupPayload
  | PitchButtonPayload
  | EmailAutoPayload
  | Record<string, never>

export interface WebinarEvent {
  id: string
  webinar_id: string
  type: EventType
  timestamp_seconds: number
  payload: EventPayload
  created_at: string
}

export interface Lead {
  id: string
  webinar_id: string
  project_id: string
  email: string
  name: string
  phone: string | null
  attended: boolean
  registered_at: string
}

export interface SessionEvent {
  id: string
  session_id: string
  webinar_id: string
  project_id: string
  lead_id: string | null
  event_type: SessionEventType
  timestamp_video: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ChatMessage {
  id: string
  author: string
  avatar?: string
  text: string
  timestamp: number
  isSimulated: boolean
}

// Analytics
export interface ViewersByMinute {
  minute: number
  viewers: number
}

export interface AnalyticsSummary {
  total_leads: number
  total_attended: number
  cta_clicks: number
  popup_seen: number
  attendance_rate: number
  conversion_rate: number
  viewers_by_minute: ViewersByMinute[]
}
