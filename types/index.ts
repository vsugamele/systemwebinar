export type WebinarStatus = 'draft' | 'active' | 'paused'

export interface ChatSegment {
  from: number
  to: number | null
  cpm: number
  phrases?: 'elogios' | 'vaga' | 'engajamento' | 'todas' | null
}
export type EventType = 'chat_message' | 'offer_popup' | 'pitch_button' | 'hide_pitch_button' | 'email_auto' | 'poll' | 'quiz_question' | 'pinned_message'
export type SessionEventType = 'page_view' | 'joined' | 'play_started' | 'watch_second' | 'watch_milestone_30min' | 'progress_50' | 'cta_clicked' | 'cta_dismissed' | 'popup_seen' | 'popup_dismissed' | 'left' | 'chat_sent' | 'trigger_in_webinar_email'

export interface Project {
  id: string
  owner_id: string
  name: string
  logo_url: string | null
  accent_color: string
  custom_domain: string | null
  resend_from_email: string | null
  openrouter_api_key?: string
  timezone?: string
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
  // Chat (003 — missing from interface)
  chat_cpm?: number
  chat_names?: string[]
  // Chat (004)
  chat_default_tab: 'chat' | 'qa'
  // Chat v2 (007)
  chat_mode?: 'cpm' | 'interval'
  chat_interval_minutes?: number
  chat_start_seconds?: number
  chat_end_seconds?: number | null
  chat_phrases?: string[] | null
  // Chat segments (008)
  chat_segments?: ChatSegment[] | null
  // Live scheduling (007)
  scheduled_start_at?: string | null
  // Recurring schedule (010)
  schedule_recurrence?: 'once' | 'daily' | 'weekly' | 'monthly'
  schedule_time?: string | null
  schedule_days?: number[] | null
  // Appearance
  theme?: 'dark' | 'light' | 'youtube'
  display_name?: string
  disable_qa?: boolean
  is_evergreen?: boolean
  // AI Config
  ai_model?: string
  // Integrations (013)
  webhook_url?: string | null
  whatsapp_api_url?: string | null
  whatsapp_api_key?: string | null
  whatsapp_welcome_message?: string | null
  whatsapp_pitch_message?: string | null
  // New features
  bad_words_filter?: boolean
  fallback_url?: string | null
  is_panic_active?: boolean
  custom_background_url?: string | null
  // Landing Page
  landing_headline?: string | null
  landing_subheadline?: string | null
  landing_button_text?: string | null
}

// ---- Event Payloads ----

export interface ChatMessagePayload {
  author: string
  avatar?: string
  text: string
  image_url?: string    // product image shown in chat bubble
  link_url?: string     // CTA link URL
  link_text?: string    // CTA button label (default: "Ver agora →")
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

export interface QuizQuestionPayload {
  question_id: string
}

export interface PinnedMessagePayload {
  text: string
  author?: string
  avatar?: string
  /** Se definido, o fixado desaparece automaticamente após N segundos */
  duration_seconds?: number
}

export type EventPayload =
  | ChatMessagePayload
  | OfferPopupPayload
  | PitchButtonPayload
  | EmailAutoPayload
  | PollPayload
  | QuizQuestionPayload
  | PinnedMessagePayload
  | Record<string, never>

export interface PollPayload {
  question: string
  options: string[] // Array of option strings
}

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
  metadata?: Record<string, any>
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

export interface QuizCardData {
  question_id: string
  question: string
  options: string[]
  correct_index: number
}

export interface ChatMessage {
  id: string
  author: string
  avatar?: string
  text: string
  timestamp: number
  isSimulated: boolean
  isBroadcast?: boolean
  image_url?: string
  link_url?: string
  link_text?: string
  quiz_card?: QuizCardData
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
