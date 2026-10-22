import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient(forceRefresh = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('Supabase environment variables not found')
    throw new Error('Supabase configuration missing')
  }

  if (!client || forceRefresh) {
    client = createBrowserClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  }

  return client
}