'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Clock, ShieldAlert, ArrowRight, LogOut } from 'lucide-react'
import { clearAuthStorage } from '@/lib/utils/auth-session'

// Configurable constants
// Inactivity threshold: 30 minutes (1,800,000 ms)
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
// Warning threshold: 2 minutes (120,000 ms) before timeout (at 28 minutes of inactivity)
const WARNING_THRESHOLD_MS = 2 * 60 * 1000
// Grace countdown duration when returning to an inactive tab (60 seconds)
const GRACE_PERIOD_SECONDS = 60
// Throttle activity recording to at most once every second
const ACTIVITY_THROTTLE_MS = 1000
// Keep-alive refresh interval: every 4 minutes while active to prevent JWT expiration
const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000
// Key for synchronizing last activity timestamp across browser tabs
const STORAGE_KEY = 'jaspel_last_active_time'
// Key for notifying other tabs about explicit logout
const LOGOUT_SYNC_KEY = 'jaspel_logout_event'

// List of all user interaction events to track
const INTERACTION_EVENTS = [
  'mousemove',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'keydown',
  'keyup',
  'wheel',
  'scroll',
  'touchstart',
  'touchend',
  'touchmove',
  'input',
  'change',
  'focus',
  'pointerdown',
  'pointerup',
]

export default function SessionActivityManager() {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(120)
  const lastActivityRef = useRef<number>(Date.now())
  const lastKeepAliveRef = useRef<number>(Date.now())
  const isLoggingOutRef = useRef<boolean>(false)
  const graceCountdownRef = useRef<number | null>(null)

  // Get last activity time, ignoring any stale timestamps from previous days or long-past sessions
  const getStoredActivityTime = useCallback((): number => {
    if (typeof window === 'undefined') return Date.now()
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = parseInt(stored, 10)
        const now = Date.now()
        // If stored timestamp is valid and within the last 30 minutes, use it
        if (!isNaN(parsed) && parsed > 0 && parsed <= now && (now - parsed) < INACTIVITY_TIMEOUT_MS) {
          return parsed
        }
      }
    } catch {
      // fallback
    }
    // If empty or stale (>30 minutes old), reset to current time
    const now = Date.now()
    try {
      localStorage.setItem(STORAGE_KEY, now.toString())
    } catch {}
    return now
  }, [])

  // Proactive keep-alive: keeps the Supabase session token fresh while the user is active
  const touchSessionKeepAlive = useCallback(async () => {
    if (isLoggingOutRef.current) return
    const now = Date.now()
    const idleTime = now - lastActivityRef.current

    // Only refresh if the user has been active recently (within KEEP_ALIVE_INTERVAL_MS)
    if (idleTime < KEEP_ALIVE_INTERVAL_MS) {
      try {
        const supabase = createClient()
        // getSession() automatically refreshes expired or near-expiry access tokens
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          lastKeepAliveRef.current = now
        }
      } catch (err) {
        console.warn('[SessionActivityManager] Keep-alive refresh check skipped:', err)
      }
    }
  }, [])

  // Update activity timestamp in memory and localStorage
  const recordActivity = useCallback(() => {
    if (isLoggingOutRef.current) return
    const now = Date.now()
    if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return

    lastActivityRef.current = now
    graceCountdownRef.current = null
    try {
      localStorage.setItem(STORAGE_KEY, now.toString())
    } catch {
      // ignore storage quota errors
    }

    // If warning dialog was showing, dismiss it upon user activity
    setShowWarning(false)
  }, [])

  // Perform clean auto-logout on 30-minute idle timeout
  const performLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return
    isLoggingOutRef.current = true

    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
        try {
          localStorage.setItem(LOGOUT_SYNC_KEY, Date.now().toString())
        } catch {}
        clearAuthStorage(true)

        const supabase = createClient()
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})

        window.location.href = '/login?reason=idle_timeout'
      }
    } catch (err) {
      window.location.href = '/login?reason=idle_timeout'
    }
  }, [])

  // Handle explicit continue session button click
  const handleContinueSession = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    graceCountdownRef.current = null
    try {
      localStorage.setItem(STORAGE_KEY, now.toString())
    } catch {}
    setShowWarning(false)
    touchSessionKeepAlive()
  }, [touchSessionKeepAlive])

  // Format seconds to mm:ss for friendly countdown
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    if (mins > 0) {
      return `${mins} menit ${secs} detik`
    }
    return `${secs} detik`
  }

  // Setup user activity listeners and timers
  useEffect(() => {
    // ALWAYS start fresh with current time when component mounts in active authenticated layout
    const now = Date.now()
    lastActivityRef.current = now
    lastKeepAliveRef.current = now
    try {
      localStorage.setItem(STORAGE_KEY, now.toString())
    } catch {}

    // Start Supabase client auto-refresh
    try {
      const supabase = createClient()
      supabase.auth.startAutoRefresh()
    } catch (e) {
      console.warn('[SessionActivityManager] Could not start autoRefresh:', e)
    }

    // Intercept user events with capture: true so modal / portal stopPropagation doesn't block them
    const handleEvent = () => recordActivity()
    INTERACTION_EVENTS.forEach(event => {
      window.addEventListener(event, handleEvent, { capture: true, passive: true })
      document.addEventListener(event, handleEvent, { capture: true, passive: true })
    })

    // Intercept window.fetch so any API requests made by the app count as active user activity
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      recordActivity()
      return originalFetch.apply(window, args)
    }

    // Listen to localStorage events for multi-tab activity synchronization and cross-tab logout
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const newTime = parseInt(e.newValue, 10)
        if (!isNaN(newTime) && newTime > lastActivityRef.current) {
          lastActivityRef.current = newTime
          graceCountdownRef.current = null
          setShowWarning(false)
        }
      } else if (e.key === LOGOUT_SYNC_KEY && e.newValue) {
        // Another tab initiated logout
        performLogout()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    // Handle tab visibility change (e.g. user switches back to this tab or wakes from sleep)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const storedTime = getStoredActivityTime()
        lastActivityRef.current = Math.max(lastActivityRef.current, storedTime)
        const idleTime = Date.now() - lastActivityRef.current

        if (idleTime >= INACTIVITY_TIMEOUT_MS) {
          // Instead of immediate harsh logout, give user grace period countdown to click "Lanjutkan Sesi"
          if (graceCountdownRef.current === null) {
            graceCountdownRef.current = GRACE_PERIOD_SECONDS
            setSecondsRemaining(GRACE_PERIOD_SECONDS)
            setShowWarning(true)
          }
        } else {
          recordActivity()
          touchSessionKeepAlive()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    // Periodic check interval (runs every 1 second)
    const checkInterval = setInterval(() => {
      if (isLoggingOutRef.current) return

      const currentTime = Date.now()
      const storedTime = getStoredActivityTime()
      const effectiveLastActivity = Math.max(lastActivityRef.current, storedTime)
      const idleTime = currentTime - effectiveLastActivity

      // If in grace period countdown (e.g. user just returned after 30+ min)
      if (graceCountdownRef.current !== null) {
        const nextGrace = graceCountdownRef.current - 1
        graceCountdownRef.current = nextGrace
        setSecondsRemaining(Math.max(0, nextGrace))
        if (nextGrace <= 0) {
          clearInterval(checkInterval)
          performLogout()
          return
        }
        setShowWarning(true)
        return
      }

      // Case 1: Inactivity exceeds 30 minutes -> Log out
      if (idleTime >= INACTIVITY_TIMEOUT_MS) {
        clearInterval(checkInterval)
        performLogout()
        return
      }

      // Case 2: Inactivity enters warning window (last 2 minutes, i.e. 28 to 30 minutes)
      const warningWindowStart = INACTIVITY_TIMEOUT_MS - WARNING_THRESHOLD_MS
      if (idleTime >= warningWindowStart) {
        const remainingMs = INACTIVITY_TIMEOUT_MS - idleTime
        const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000))
        setSecondsRemaining(remainingSec)
        setShowWarning(true)
      } else {
        setShowWarning(false)
      }

      // Case 3: Keep-alive check every 4 minutes while active
      if (currentTime - lastKeepAliveRef.current >= KEEP_ALIVE_INTERVAL_MS) {
        touchSessionKeepAlive()
      }
    }, 1000)

    return () => {
      INTERACTION_EVENTS.forEach(event => {
        window.removeEventListener(event, handleEvent, { capture: true })
        document.removeEventListener(event, handleEvent, { capture: true })
      })
      window.fetch = originalFetch
      window.removeEventListener('storage', handleStorageChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
      clearInterval(checkInterval)
    }
  }, [getStoredActivityTime, recordActivity, touchSessionKeepAlive, performLogout])

  return (
    <Dialog open={showWarning} onOpenChange={(open) => {
      if (!open) {
        handleContinueSession()
      }
    }}>
      <DialogContent className="sm:max-w-[460px] p-6 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 shadow-2xl rounded-2xl z-[9999]">
        <DialogHeader className="space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 shadow-inner">
            <Clock className="h-7 w-7 animate-pulse text-amber-600" />
          </div>
          <DialogTitle className="text-center text-xl font-bold text-gray-900 dark:text-gray-100">
            Pemberitahuan Inaktivitas Sesi
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Tidak ada aktivitas terdeteksi selama hampir 30 menit. Sesi Anda akan berakhir secara otomatis dalam:
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 py-3 px-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 flex items-center justify-center gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-bounce" />
          <span className="text-2xl font-black text-amber-700 dark:text-amber-300 font-mono tracking-wider">
            {formatTime(secondsRemaining)}
          </span>
        </div>

        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          Gerakkan kursor, tekan tombol keyboard, atau klik tombol di bawah untuk memperpanjang sesi dan tetap masuk.
        </p>

        <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={performLogout}
            className="w-full sm:w-auto text-gray-600 hover:text-gray-800 border-gray-300"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Keluar Sekarang
          </Button>
          <Button
            type="button"
            onClick={handleContinueSession}
            className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20"
          >
            Lanjutkan Sesi
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
