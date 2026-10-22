/**
 * Auth session utilities for handling invalid tokens and session cleanup
 */

import { createClient } from '@/lib/supabase/client'

/**
 * Safely parse JSON string, return null if invalid
 */
function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/**
 * Clear all auth-related data from browser storage
 */
export function clearAuthStorage(force = false) {
  if (typeof window === 'undefined') return

  try {
    // Don't clear auth storage if user is currently on an authenticated route unless forced
    if (!force && window.location.pathname !== '/login') {
      return
    }

    // Special handling for login page: we WANT to clear stale data here
    // to prevent "Invalid Refresh Token" console errors

    console.log('[AUTH_STORAGE] Clearing auth storage...')

    // Clear localStorage
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key)
      } catch (error) {
        // ignore
      }
    })

    // Clear sessionStorage
    const sessionKeysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        sessionKeysToRemove.push(key)
      }
    }
    sessionKeysToRemove.forEach(key => {
      try {
        sessionStorage.removeItem(key)
      } catch (error) {
        // ignore
      }
    })

    // Clear cookies manually as a fallback
    const cookies = document.cookie.split(';')
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim()
      if (cookie.startsWith('sb-') || cookie.includes('supabase')) {
        const name = cookie.split('=')[0]
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
      }
    }

    console.log('[AUTH_STORAGE] Auth storage cleared')
  } catch (error: any) {
    console.error('Error clearing auth storage:', error)
  }
}

/**
 * Validate and fix corrupted session data
 */
export function validateSessionData(): boolean {
  if (typeof window === 'undefined') return true

  try {
    // Check all supabase-related localStorage items
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        const value = localStorage.getItem(key)
        if (value) {
          // Try to parse the value
          const parsed = safeJsonParse(value)
          if (parsed === null && value.startsWith('{')) {
            // Corrupted JSON, remove it
            localStorage.removeItem(key)
          }
        }
      }
    }

    return true
  } catch (error: any) {
    return false
  }
}

/**
 * Handle invalid refresh token error
 * Clears storage and redirects to login, UNLESS it is a 429 Rate Limit error.
 */
export async function handleInvalidRefreshToken(error?: any) {
  if (typeof window === 'undefined') return

  // Prevent clearing storage or logging out on 429 Rate Limit, 400 Invalid Refresh Token (race conditions), or temporary network errors
  if (
    error?.status === 429 ||
    error?.statusCode === 429 ||
    error?.message?.includes('429') ||
    error?.message?.includes('rate limit') ||
    error?.message?.includes('Too Many Requests') ||
    error?.status === 400 ||
    error?.statusCode === 400 ||
    error?.message?.toLowerCase().includes('invalid refresh token')
  ) {
    console.warn('[AUTH_STORAGE] Suppressed clearing storage due to rate limit or SSR race condition (400/429)')
    return
  }

  try {
    // Clear client-side storage first
    clearAuthStorage(true)

    const supabase = createClient()
    // Sign out to clear server-side session (optional session clearing)
    await supabase.auth.signOut({ scope: 'local' }).catch(() => { })

    // Redirect to login
    const currentPath = window.location.pathname
    if (currentPath !== '/login') {
      window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}&error=session_expired`
    }
  } catch (err: any) {
    window.location.href = '/login?error=session_expired'
  }
}

/**
 * Setup global error handler for auth errors - MINIMAL VERSION
 * Only handles sign out, no interference with normal auth flow
 */
export function setupAuthErrorHandler() {
  if (typeof window === 'undefined') return

  const pathname = window.location.pathname

  // Skip on login page to avoid "Refresh Token Not Found" console errors
  // during client initialization when a stale session exists
  if (pathname === '/login') {
    validateSessionData()
    // Clear storage on login page to ensure clean start
    // but don't initialize Supabase client yet
    return
  }

  // Validate session data on startup
  validateSessionData()

  try {
    const supabase = createClient()

    // Only listen for events
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && window.location.pathname === '/login') {
        clearAuthStorage(true)
      }
    })
  } catch (err) {
    // Ignore initialization errors
  }
}

/**
 * Verify current session is valid
 */
export async function verifySession(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    // First validate local storage
    if (!validateSessionData()) {
      return false
    }

    const supabase = createClient()
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      if (error.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
        console.warn('[AUTH_SESSION] Rate limit hit during session verification. Preserving session.')
        return true
      }
      await handleInvalidRefreshToken(error)
      return false
    }

    if (!session) {
      await handleInvalidRefreshToken()
      return false
    }

    return true
  } catch (error: any) {
    console.error('Error verifying session:', error)
    if (error?.status === 429 || error?.message?.includes('429')) {
      return true
    }
    await handleInvalidRefreshToken(error)
    return false
  }
}
