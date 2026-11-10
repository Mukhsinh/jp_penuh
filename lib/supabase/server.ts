import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Create a Supabase client for server-side operations with user context
 * Uses anon key with cookie-based auth for user-scoped operations
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error: any) {
            // Handle cookie setting errors (e.g. from Server Components)
          }
        },
      },
    }
  )
}

/**
 * Global singleton instance of Supabase admin client for server-side operations.
 * Reusing this instance prevents socket exhaustion, reduces memory allocation,
 * and maintains keep-alive HTTP connections during high multi-user concurrent traffic.
 */
let cachedAdminClient: ReturnType<typeof createSupabaseClient> | null = null

/**
 * Create or reuse a Supabase admin client for server-side operations.
 * Uses service role key for admin operations (bypasses RLS).
 * ONLY use this for admin operations that require elevated privileges.
 */
export async function createAdminClient() {
  if (!cachedAdminClient) {
    cachedAdminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  }
  return cachedAdminClient
}
