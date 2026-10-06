'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Role, hasPermission, type Permission, getMenuItemsForRole, type MenuItem } from '@/lib/services/rbac.service'

export interface User {
  id: string
  email: string
  role: Role
  full_name?: string
  unit_id?: string
}

// OPTIMIZED: Simple in-memory cache with automatic cleanup
class UserCache {
  private cache: User | null = null
  private timestamp = 0
  private readonly TTL = 30000 // 30 seconds

  get(): User | null {
    if (!this.cache || Date.now() - this.timestamp > this.TTL) {
      this.clear()
      return null
    }
    return this.cache
  }

  set(user: User): void {
    this.cache = user
    this.timestamp = Date.now()
  }

  clear(): void {
    this.cache = null
    this.timestamp = 0
  }
}

const userCache = new UserCache()

export function useAuth() {
  const [user, setUser] = useState<User | null>(userCache.get())
  const [loading, setLoading] = useState(!userCache.get())
  const fetchingRef = useRef(false)
  const mountedRef = useRef(true)

  // OPTIMIZED: Memoized load function
  const loadUser = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (fetchingRef.current) {
      return
    }

    // Check cache first
    const cachedUser = userCache.get()
    if (cachedUser) {
      if (mountedRef.current) {
        setUser(cachedUser)
        setLoading(false)
      }
      return
    }

    fetchingRef.current = true

    try {
      const supabase = createClient()

      // Get session with timeout
      const sessionPromise = supabase.auth.getSession()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Session timeout')), 5000)
      )

      const { data: { session }, error: sessionError } = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]) as any

      if (sessionError || !session?.user) {
        userCache.clear()
        if (mountedRef.current) {
          setUser(null)
          setLoading(false)
        }
        return
      }

      const sessionUser = session.user
      const userMeta = sessionUser.user_metadata || {}

      // OPTIMIZED: Consistent role detection with middleware
      const rawRole = (userMeta.role || '').toString().toLowerCase()
      const isSuperEmail = sessionUser.email === 'admin@sungaipenuh.com'
      let role = (isSuperEmail || rawRole === 'superadmin') ? 'superadmin' : (rawRole || 'employee') as Role

      // Try to get employee data with timeout
      let fullName = sessionUser.user_metadata?.full_name || sessionUser.email
      let unitId: string | undefined

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)

        const { data: employeeData } = await supabase
          .from('m_employees')
          .select('full_name, unit_id, role')
          .eq('user_id', sessionUser.id)
          .abortSignal(controller.signal)
          .maybeSingle()

        clearTimeout(timeoutId)

        if (employeeData) {
          fullName = employeeData.full_name || fullName
          unitId = employeeData.unit_id

          // Re-verify role from employee record if not superadmin via email
          if (!isSuperEmail) {
            role = (employeeData.role || role) as Role
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[useAuth] Employee fetch failed:', err.message)
        }
      }

      const newUser: User = {
        id: sessionUser.id,
        email: sessionUser.email || '',
        role: role as Role,
        full_name: fullName,
        unit_id: unitId,
      }

      // Update cache
      userCache.set(newUser)

      if (mountedRef.current) {
        setUser(newUser)
        setLoading(false)
      }

    } catch (error) {
      console.error('[useAuth] Error loading user:', error)
      if (mountedRef.current) {
        setUser(null)
        setLoading(false)
      }
    } finally {
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    loadUser()

    // Listen to auth changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        userCache.clear()
        if (mountedRef.current) {
          setUser(null)
          setLoading(false)
        }
      } else if (event === 'SIGNED_IN' && session) {
        // Invalidate cache on sign in
        userCache.clear()
        loadUser()
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [loadUser])

  return { user, loading }
}

export function usePermission(permission: Permission) {
  const { user } = useAuth()

  return useMemo(() => {
    if (!user) return false
    return hasPermission(user.role, permission)
  }, [user, permission])
}

export function useMenuItems(): MenuItem[] {
  const { user } = useAuth()

  return useMemo(() => {
    if (!user) return []
    return getMenuItemsForRole(user.role)
  }, [user])
}
