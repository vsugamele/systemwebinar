import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createBrowserClient(url, key)
}

/**
 * Lightweight anonymous client for webinar viewers.
 * Auth session persistence is disabled because viewers are not logged in —
 * they only need Realtime subscriptions and anonymous DB queries.
 * Disabling persistence prevents GoTrue from competing for the localStorage
 * auth lock ("lock:sb-...-auth-token was not released within 5000ms").
 */
export function createAnonViewerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createBrowserClient(url, key, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  })
}
