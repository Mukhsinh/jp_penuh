import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import {
  isPublicRoute,
  isLegacyRoute,
  getLegacyRedirectPath,
  isRouteAllowed
} from '@/lib/services/route-config.service'
import type { Role } from '@/lib/services/rbac.service'

// OPTIMIZED: LRU Cache with better memory management
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>()
  private maxSize: number
  private ttl: number

  constructor(maxSize = 500, ttl = 5 * 60 * 1000) {
    this.maxSize = maxSize
    this.ttl = ttl
  }

  get(key: string): T | null {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }

    // Move to end (LRU)
    this.cache.delete(key)
    this.cache.set(key, item)
    return item.value
  }

  set(key: string, value: T): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  clear(): void {
    this.cache.clear()
  }
}

// Optimized cache instance with enhanced settings
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes TTL (increased from 5 minutes)
const MAX_CACHE_SIZE = 1000 // Increased cache size

const employeeCache = new LRUCache<{
  role: Role
  is_active: boolean
}>(MAX_CACHE_SIZE, CACHE_TTL)

// Background cleanup (runs less frequently)
let lastCleanup = 0
const CLEANUP_INTERVAL = 10 * 60 * 1000 // 10 minutes

function shouldCleanup(): boolean {
  const now = Date.now()
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now
    return true
  }
  return false
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    // 0. Skip middleware for static assets, favicon, health check, and all API routes
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.startsWith('/icon') ||
      pathname.includes('.') ||
      pathname.startsWith('/api/')
    ) {
      return response
    }

    console.log('[MIDDLEWARE] Path:', pathname, '| Cookies present:', request.cookies.getAll().map(c => c.name))

    // Background cleanup (only occasionally)
    if (shouldCleanup()) {
      employeeCache.clear()
    }

    // 1. Create supabase client with modern getAll / setAll
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
              response = NextResponse.next({
                request,
              })
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              )
            } catch (e) {
              // Ignore cookie setting errors in middleware
            }
          },
        },
      }
    )

    // IMPORTANT: Verify user session securely
    let { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      if (!userError.message.includes('Refresh Token Not Found')) {
        console.warn('[MIDDLEWARE] Auth check getUser error:', userError.message)
      }

      // Fallback: If getUser implies a rate limit or internal server fail (not an explicitly rejected token),
      // verify using local JWT session to save the user from suddenly getting logged out.
      const status = (userError as any)?.status
      if (status === 429 || status >= 500) {
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData && sessionData.session && sessionData.session.user) {
          user = sessionData.session.user
          userError = null
          console.log('[MIDDLEWARE] Fallback to getSession succeeded despite rate limit.')
        }
      }
    }

    const session = user ? { user } : null
    console.log('[MIDDLEWARE] Path:', pathname, '| Session User:', user?.email || 'NONE', '| UserError:', userError?.message || 'NONE')


    // 2. Check if public route (login, reset-password, forbidden)
    if (isPublicRoute(pathname)) {
      // If user is already authenticated and visits /login, redirect to /dashboard
      if (session && pathname === '/login') {
        const dashboardUrl = new URL('/dashboard', request.url)
        return NextResponse.redirect(dashboardUrl)
      }
      return response
    }

    // 3. Check for legacy routes and redirect permanently
    if (isLegacyRoute(pathname)) {
      const newPath = getLegacyRedirectPath(pathname)
      if (newPath) {
        const url = new URL(newPath, request.url)
        url.search = request.nextUrl.search
        return NextResponse.redirect(url, 301)
      }
    }

    // 4. Validate session
    if (!session) {
      // For API routes, return JSON 401 Unauthorized instead of redirect HTML
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Only redirect to login if not already on login page
      if (pathname !== '/login') {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
      }
      // If already on login page, just continue
      return response
    }

    // 5. Get employee data and role (with optimized caching)
    let employeeData = employeeCache.get(session.user.id)

    // Check if cached role matches auth metadata role
    // If not, invalidate cache to pick up the updated role
    const sessionMetadataRole = session.user.user_metadata?.role
    if (employeeData && sessionMetadataRole && employeeData.role !== sessionMetadataRole) {
      employeeData = null // Invalidate cache
    }

    if (!employeeData) {
      // 1. Check auth metadata first (it's the source of truth for superadmins)
      const userMeta = session.user.user_metadata || {}
      const appMeta = session.user.app_metadata || {}

      const rawRole = (appMeta.role || userMeta.role || '').toString().toLowerCase()
      const isAdmin = rawRole === 'superadmin' || rawRole === 'admin' || session.user.email === 'admin@sungaibahar.com'

      if (isAdmin) {
        employeeData = {
          role: 'superadmin' as Role,
          is_active: true
        }
        employeeCache.set(session.user.id, employeeData)
      } else {
        // 2. Fetch employee record for non-admin users - try user_id first, then email
        let { data: employee, error: employeeError } = await supabase
          .from('m_employees')
          .select('id, role, is_active')
          .eq('user_id', session.user.id)
          .limit(1)
          .maybeSingle()

        if (!employee && session.user.email) {
          const { data: empByEmail } = await supabase
            .from('m_employees')
            .select('id, role, is_active')
            .eq('email', session.user.email)
            .limit(1)
            .maybeSingle()

          if (empByEmail) {
            employee = empByEmail
            // Auto-sync user_id for seamless future lookups
            await supabase
              .from('m_employees')
              .update({ user_id: session.user.id })
              .eq('id', empByEmail.id)
          }
        }

        if (employeeError || !employee) {
          console.error('[MIDDLEWARE] User not found in employees and no admin metadata:', session.user.email)
          if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'User record not found' }, { status: 404 })
          }
          const loginUrl = new URL('/login', request.url)
          loginUrl.searchParams.set('error', 'user_not_found')
          return NextResponse.redirect(loginUrl)
        }

        employeeData = {
          role: (employee.role || 'employee') as Role,
          is_active: !!employee.is_active
        }
        employeeCache.set(session.user.id, employeeData)
      }
    }

    // 6. Check if employee is active
    if (!employeeData || !employeeData.is_active) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Account inactive or not found' }, { status: 403 })
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'inactive')
      return NextResponse.redirect(loginUrl)
    }

    // 7. Check route authorization
    // Superadmins can bypass route checks (they have full access)
    if (employeeData && employeeData.role !== 'superadmin' && !pathname.startsWith('/api/') && !isRouteAllowed(pathname, employeeData.role)) {
      const forbiddenUrl = new URL('/forbidden', request.url)
      return NextResponse.redirect(forbiddenUrl)
    }

    // 8. Set security headers
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('X-XSS-Protection', '1; mode=block')

    return response
  } catch (error: any) {
    console.error('Middleware error:', error)

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Never redirect public routes (like /login) to /login to prevent infinite redirect loops
    if (isPublicRoute(pathname)) {
      return response
    }

    // On any error for protected routes, redirect to login without clearing cookies
    // to prevent wiping session on random network hiccups.
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: [
    // Protected routes (exact and subpaths)
    '/dashboard',
    '/dashboard/:path*',
    '/units',
    '/units/:path*',
    '/users',
    '/users/:path*',
    '/pegawai',
    '/pegawai/:path*',
    '/kpi-config',
    '/kpi-config/:path*',
    '/pool',
    '/pool/:path*',
    '/realization',
    '/realization/:path*',
    '/assessment',
    '/assessment/:path*',
    '/reports',
    '/reports/:path*',
    '/audit',
    '/audit/:path*',
    '/settings',
    '/settings/:path*',
    '/profile',
    '/profile/:path*',
    '/notifications',
    '/notifications/:path*',
    // API routes
    '/api/:path*',
    // Legacy routes for redirect
    '/admin/:path*',
    '/manager/:path*',
    '/employee/:path*',
  ],
}