'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { OptimizedLink } from '@/components/ui/optimized-link'
import { createClient } from '@/lib/supabase/client'
import { useSettings } from '@/lib/contexts/settings-context'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Target,
  Wallet,
  FileText,
  BarChart3,
  Settings,
  Shield,
  User,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Bell,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  email: string
  role: 'superadmin' | 'unit_manager' | 'employee'
  full_name?: string
  unit_id?: string
}

interface MenuItem {
  id: string
  label: string
  path: string
  icon: string
}

interface SidebarInnerProps {
  isCollapsed: boolean
  setIsCollapsed: (c: boolean | ((c: boolean) => boolean)) => void
  isMobileOpen: boolean
  setIsMobileOpen: (o: boolean) => void
  companyInfo: any
  user: UserProfile | null
  unitName: string
  unreadCount: number
  showLogoutDialog: boolean
  setShowLogoutDialog: (s: boolean) => void
  handleLogout: () => Promise<void>
  isActive: (path: string) => boolean
  menuItems: MenuItem[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Target,
  Wallet,
  FileText,
  BarChart3,
  Settings,
  Shield,
  User,
  Bell,
  ClipboardCheck,
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
  { id: 'units', label: 'Unit Kerja', path: '/units', icon: 'Building2' },
  { id: 'pegawai', label: 'Data Pegawai', path: '/pegawai', icon: 'UserCheck' },
  { id: 'kpi-config', label: 'Konfigurasi KPI', path: '/kpi-config', icon: 'Target' },
  { id: 'pool', label: 'Pool Insentif', path: '/pool', icon: 'Wallet' },
  { id: 'assessment', label: 'Penilaian KPI', path: '/assessment', icon: 'ClipboardCheck' },
  { id: 'reports', label: 'Laporan', path: '/reports', icon: 'BarChart3' },
  { id: 'users', label: 'Manajemen Pengguna', path: '/users', icon: 'Users' },
  { id: 'settings', label: 'Pengaturan', path: '/settings', icon: 'Settings' },
  { id: 'notifications', label: 'Notifikasi', path: '/notifications', icon: 'Bell' },
  { id: 'audit', label: 'Audit Trail', path: '/audit', icon: 'Shield' },
]

function getMenuItems(role: string): MenuItem[] {
  if (role === 'superadmin') return ALL_MENU_ITEMS
  if (role === 'unit_manager') {
    return ALL_MENU_ITEMS.filter(i =>
      i && ['dashboard', 'kpi-config', 'pool', 'assessment', 'reports'].includes(i.id)
    )
  }
  return [] // Employees have no access as per requirement
}

// ── Auth Hook ────────────────────────────────────────────────────────────────

function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ; (async () => {
      try {
        const supabase = createClient()
        // Try local getSession() first to avoid remote Auth API rate limit (429)
        const { data: { session } } = await supabase.auth.getSession()
        let authUser: any = session?.user
        if (!authUser) {
          try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) authUser = user
          } catch (e) {
            // ignore rate limit error
          }
        }

        if (authUser) {
          const authRole = authUser.app_metadata?.role || authUser.user_metadata?.role
          const isSuperAdmin = authRole === 'superadmin' || authUser.email === 'admin@sungaipenuh.com'
          const role = isSuperAdmin ? 'superadmin' : (authRole || 'employee')

          const { data: emp } = await supabase
            .from('m_employees')
            .select('full_name, unit_id, role')
            .eq('user_id', authUser.id)
            .maybeSingle()

          setUser({
            id: authUser.id,
            email: authUser.email || '',
            role: role as any,
            full_name: emp?.full_name || authUser.user_metadata?.full_name || 'Admin Sistem',
            unit_id: emp?.unit_id,
          })
        }
      } catch (e) {
        console.error('Sidebar auth error:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return { user, loading }
}

// ── Sidebar Component ─────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  const { settings } = useSettings()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [unitName, setUnitName] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Persist collapsed state
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved) setIsCollapsed(JSON.parse(saved))
    } catch { }
  }, [])

  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed))
        // Update CSS variable for layout
        document.documentElement.style.setProperty(
          '--sidebar-width',
          isCollapsed ? '80px' : '272px'
        )
      } catch { }
    }
  }, [isCollapsed, mounted])

  // Load sidebar data once user is ready — all in parallel for speed
  useEffect(() => {
    if (!user) return
      ; (async () => {
        try {
          const supabase = createClient()

          // Run all fetches in parallel
          const [unitRes, notifRes] = await Promise.all([
            (user.role !== 'superadmin' && user.unit_id)
              ? supabase.from('m_units').select('name').eq('id', user.unit_id).single()
              : Promise.resolve(null),
            supabase.from('t_notification').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
          ])

          if (unitRes?.data) setUnitName(unitRes.data.name || '')
          setUnreadCount(notifRes?.count || 0)
        } catch { }
      })()
  }, [user])

  const companyInfo = settings?.companyInfo

  const handleLogout = useCallback(async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch (e) {
      console.error('Logout error:', e)
    }
  }, [])

  const isActive = useCallback(
    (path: string) => pathname === path || pathname.startsWith(path + '/'),
    [pathname]
  )

  const menuItems = user ? getMenuItems(user.role) : []

  // ── Skeleton (shown while loading or not mounted) ──────────────────────────
  const SkeletonContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      <div className="p-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 40%, #3b82f6 100%)' }}>
        <div className="h-8 bg-white/20 rounded-2xl animate-pulse" />
      </div>
      <div className="p-4 space-y-2 flex-1">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )

  // ── Sidebar Inner Component ───────────────────────────────────────────────
  const SidebarInner = ({
    isCollapsed,
    setIsCollapsed,
    isMobileOpen,
    setIsMobileOpen,
    companyInfo,
    user,
    unitName,
    unreadCount,
    showLogoutDialog,
    setShowLogoutDialog,
    handleLogout,
    isActive,
    menuItems
  }: SidebarInnerProps) => (
    <div className="flex flex-col h-full overflow-hidden bg-white border-r border-slate-200/80 shadow-lg">
      {/* Header */}
      <div className="relative overflow-hidden flex-shrink-0 premium-gradient">
        {/* Decorative elements */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-indigo-500/20 blur-2xl" />
        <div className="absolute inset-0 bg-white/5 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />

        <div className="relative p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <div className="flex items-center gap-4 min-w-0 animate-in">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0 overflow-hidden hover-scale border border-white/20">
                  {companyInfo?.logo
                    ? <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-contain p-1" />
                    : <span className="text-blue-600 font-bold text-2xl">G</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h1
                    className="leading-tight uppercase font-black tracking-tight text-[#f97316] break-words"
                    style={{ fontSize: '19px' }}
                  >
                    {companyInfo?.appName || 'PINTAR JP'}
                  </h1>
                  <p className="text-[10px] font-medium text-blue-100 uppercase tracking-wide opacity-90 mt-0.5 leading-tight line-clamp-2">
                    {companyInfo?.name || 'Management System'}
                  </p>
                </div>
              </div>
            )}
            {isCollapsed && (
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xl mx-auto hover-scale border border-white/20 animate-in">
                {companyInfo?.logo
                  ? <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                  : <span className="text-blue-600 font-bold text-xl">G</span>
                }
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(c => !c)}
              className="p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white flex-shrink-0 hidden lg:flex hover-scale border border-transparent hover:border-white/10"
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white flex-shrink-0 lg:hidden hover-scale"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 scrollbar-hide">
        {menuItems.map(item => {
          if (!item) return null
          const Icon = iconMap[item.icon] || User
          const active = isActive(item.path)
          const isNotif = item.id === 'notifications'

          return (
            <OptimizedLink
              key={item.id}
              href={item.path}
              onClick={() => setIsMobileOpen(false)}
              className={cn(
                'w-full flex items-center gap-4 px-4 py-2 rounded-xl transition-all duration-300 group hover-scale',
                active
                  ? 'premium-gradient text-white shadow-lg shadow-blue-600/30 ring-1 ring-white/20'
                  : 'text-slate-600 hover:bg-blue-50/50 hover:text-blue-700'
              )}
            >
              <div className="relative flex-shrink-0">
                <Icon size={20} className={cn('transition-all duration-300', active ? 'text-white scale-110' : 'text-slate-400 group-hover:text-blue-600 group-hover:scale-110')} />
                {isNotif && unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <span className={cn('text-[14px] font-medium tracking-normal truncate', active ? 'text-white' : 'text-slate-600')}>
                  {item.label}
                </span>
              )}
              {active && !isCollapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
              )}
            </OptimizedLink>
          )
        })}
      </nav>

      {/* Bottom: User Info + Logout */}
      <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex-shrink-0">
        {user && (
          <>
            {/* Confirm dialog */}
            {showLogoutDialog && (
              <div className="mb-3 p-4 glass bg-white/90 rounded-2xl border border-red-100 shadow-xl animate-in">
                <p className="text-[13px] text-slate-800 font-bold mb-4 text-center">Keluar dari sistem?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowLogoutDialog(false)}
                    className="flex-1 h-10 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all active:scale-95"
                  >
                    BATAL
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 h-10 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-200 transition-all active:scale-95"
                  >
                    YA, KELUAR
                  </button>
                </div>
              </div>
            )}

            {/* User Profile Card */}
            <div className={cn(
              'rounded-2xl bg-white border border-slate-100 shadow-sm transition-all duration-300',
              isCollapsed ? 'p-2 flex flex-col items-center gap-3' : 'p-3 flex items-center gap-4 hover:shadow-md'
            )}>
              {/* Avatar */}
              <div className="relative group flex-shrink-0">
                <div className="w-11 h-11 premium-gradient rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-105 transition-transform">
                  {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
              </div>

              {!isCollapsed && (
                <div className="min-w-0 flex-1 animate-in">
                  <div className="font-semibold text-[13px] text-slate-800 truncate">
                    {user.full_name || user.email}
                  </div>
                  {unitName && <div className="text-[10px] text-slate-400 truncate mt-0.5">{unitName}</div>}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-md font-medium',
                      user.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'unit_manager' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                    )}>
                      {user.role === 'superadmin' ? 'Superadmin' :
                        user.role === 'unit_manager' ? 'Manajer Unit' : 'Pegawai'}
                    </span>
                  </div>
                </div>
              )}

              {/* Logout button */}
              <button
                onClick={() => setShowLogoutDialog(true)}
                title="Keluar"
                className="p-2.5 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all hover-scale"
              >
                <LogOut size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Mobile hamburger button (always visible on mobile) ── */}
      <button
        onClick={() => setIsMobileOpen(o => !o)}
        className="lg:hidden fixed top-4 left-4 z-[60] w-12 h-12 flex items-center justify-center premium-gradient text-white rounded-2xl shadow-xl shadow-blue-500/30 active:scale-95 transition-all hover-scale hover:rotate-12 group"
        aria-label="Toggle navigation"
      >
        <Menu size={24} className="group-hover:scale-110 transition-transform" />
      </button>

      {/* ── Mobile backdrop ── */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-slate-900/60 backdrop-blur-md animate-in"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* ── Mobile sidebar (slides in from left) ── */}
      <aside
        className={cn(
          'lg:hidden fixed top-0 left-0 h-screen w-[300px] z-[60] transition-transform duration-500 ease-out',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {!mounted || loading ? <SkeletonContent /> : (
          <SidebarInner
            isCollapsed={false} // Always expanded on mobile
            setIsCollapsed={() => { }}
            isMobileOpen={isMobileOpen}
            setIsMobileOpen={setIsMobileOpen}
            companyInfo={companyInfo}
            user={user}
            unitName={unitName}
            unreadCount={unreadCount}
            showLogoutDialog={showLogoutDialog}
            setShowLogoutDialog={setShowLogoutDialog}
            handleLogout={handleLogout}
            isActive={isActive}
            menuItems={menuItems}
          />
        )}
      </aside>

      {/* ── Desktop sidebar (always visible, collapsible) ── */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-transparent z-[50] transition-all duration-500 ease-out',
          mounted && isCollapsed ? 'w-20' : 'w-[272px]'
        )}
      >
        {!mounted || loading ? <SkeletonContent /> : (
          <SidebarInner
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
            isMobileOpen={false}
            setIsMobileOpen={() => { }}
            companyInfo={companyInfo}
            user={user}
            unitName={unitName}
            unreadCount={unreadCount}
            showLogoutDialog={showLogoutDialog}
            setShowLogoutDialog={setShowLogoutDialog}
            handleLogout={handleLogout}
            isActive={isActive}
            menuItems={menuItems}
          />
        )}
      </aside>
    </>
  )
}