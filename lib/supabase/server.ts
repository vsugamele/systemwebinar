import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars not set')

  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
}


export async function createServiceClient() {
  const cookieStore = await cookies()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fallback se a chave do service role for nula, vazia ou o placeholder do .env.local
  const keyToUse = (!serviceKey || serviceKey === 'your-service-role-key') ? anonKey : serviceKey
  
  if (!keyToUse) {
    throw new Error('Supabase key (service role or anon key) not configured')
  }

  if (!serviceKey || serviceKey === 'your-service-role-key') {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente. Usando chave anônima como fallback.')
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    keyToUse!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createPureServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const keyToUse = (!serviceKey || serviceKey === 'your-service-role-key') ? anonKey : serviceKey
  
  if (!url || !keyToUse) {
    throw new Error('Supabase URL or Key not configured')
  }

  return createSupabaseClient(url, keyToUse, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  })
}
