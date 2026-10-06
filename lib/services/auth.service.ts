import { createClient } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'
import { handleAuthError, logAuthError } from '@/lib/utils/auth-errors'
import type { UserWithEmployee, UserMetadata, Pegawai } from '@/lib/types/database.types'
import { clearAllStorage } from '@/lib/utils/storage-adapter'

export interface LoginCredentials {
  email: string
  password: string
}

export interface UserData {
  id: string
  email: string
  role: string
  unit_id: string | null
  is_active: boolean
  full_name: string
}

export interface LoginResult {
  success: boolean
  user?: UserData
  error?: string
}

export type UserRole = 'superadmin' | 'unit_manager' | 'employee'

class AuthService {
  // Consistent superadmin check used across all methods
  private isSuperadminEmail(email?: string): boolean {
    return email === 'admin@sungaipenuh.com'
  }

  async signIn(email: string, password: string): Promise<LoginResult> {
    try {
      if (typeof window === 'undefined') {
        return { success: false, error: 'Login hanya dapat dilakukan di browser' }
      }

      const supabase = createClient()

      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch (clearError) {
        console.warn('[AUTH] Error clearing session:', clearError)
      }

      const signInPromise = supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password,
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Login timeout')), 10000)
      )

      const { data: authData, error: authError } = await Promise.race([signInPromise, timeoutPromise]) as any

      if (authError || !authData.user) {
        logAuthError('signIn', authError)
        return { success: false, error: handleAuthError(authError) }
      }

      const { data: employeeData, error: employeeError } = await supabase
        .from('m_employees')
        .select('id, full_name, unit_id, is_active, role')
        .eq('user_id', authData.user.id)
        .maybeSingle()

      if (employeeError) {
        logAuthError('employee-fetch', employeeError)
        await supabase.auth.signOut()
        return { success: false, error: 'Gagal mengambil data pegawai' }
      }

      // Consistent role detection
      const isSuper = this.isSuperadminEmail(authData.user.email)
      const role = isSuper ? 'superadmin' : (employeeData?.role || authData.user.user_metadata?.role || 'employee')

      if (employeeData && !employeeData.is_active && !isSuper) {
        await supabase.auth.signOut()
        return { success: false, error: 'Akun Anda tidak aktif' }
      }

      const userDataResult: UserData = {
        id: authData.user.id,
        email: authData.user.email || '',
        role: role as string,
        unit_id: employeeData?.unit_id || null,
        is_active: employeeData?.is_active ?? true,
        full_name: employeeData?.full_name || authData.user.user_metadata?.full_name || authData.user.email || 'User',
      }

      return { success: true, user: userDataResult }
    } catch (error: any) {
      logAuthError('signIn-exception', error)
      return { success: false, error: 'Terjadi kesalahan, silakan coba lagi' }
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    return this.signIn(credentials.email, credentials.password)
  }

  async signOut(): Promise<void> {
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: 'global' })

      if (typeof window !== 'undefined') {
        clearAllStorage()
        const cookiesToClear = ['sb-access-token', 'sb-refresh-token', 'supabase-auth-token', 'sb-auth-token']
        cookiesToClear.forEach(cookieName => {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
        })
        window.location.replace('/login')
      }
    } catch (error) {
      logAuthError('signOut-exception', error)
      if (typeof window !== 'undefined') window.location.replace('/login')
    }
  }

  async getCurrentUser(): Promise<UserData | null> {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null

      const { data: employeeData } = await supabase
        .from('m_employees')
        .select('id, full_name, unit_id, is_active, role')
        .eq('user_id', session.user.id)
        .maybeSingle()

      const isSuper = this.isSuperadminEmail(session.user.email)
      const role = isSuper ? 'superadmin' : (employeeData?.role || session.user.user_metadata?.role || 'employee')

      return {
        id: session.user.id,
        email: session.user.email || '',
        role: role as string,
        unit_id: employeeData?.unit_id || null,
        is_active: employeeData?.is_active ?? true,
        full_name: employeeData?.full_name || session.user.user_metadata?.full_name || session.user.email || 'User',
      }
    } catch (error) {
      logAuthError('getCurrentUser', error)
      return null
    }
  }

  async getUserRole(userId: string): Promise<UserRole | null> {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== userId) return null

      if (this.isSuperadminEmail(user.email)) return 'superadmin'

      const { data: employeeData } = await supabase
        .from('m_employees')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()

      return (employeeData?.role || user.user_metadata?.role || 'employee') as UserRole
    } catch (error) {
      logAuthError('getUserRole', error)
      return null
    }
  }

  async getSession(): Promise<Session | null> {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      return session
    } catch (error) {
      logAuthError('getSession', error)
      return null
    }
  }

  async getCurrentUserWithEmployee(): Promise<UserWithEmployee | null> {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null

      const { data: employeeData } = await supabase
        .from('m_employees')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()

      const isSuper = this.isSuperadminEmail(session.user.email)
      const role = isSuper ? 'superadmin' : (employeeData?.role || session.user.user_metadata?.role || 'employee')

      return {
        id: session.user.id,
        email: session.user.email || '',
        user_metadata: {
          role: role as any,
          full_name: employeeData?.full_name || session.user.user_metadata?.full_name,
          unit_id: employeeData?.unit_id || session.user.user_metadata?.unit_id
        },
        employee: employeeData as Pegawai | null
      }
    } catch (error) {
      logAuthError('getCurrentUserWithEmployee', error)
      return null
    }
  }

  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) return { success: false, error: handleAuthError(error) }
      return { success: true }
    } catch (error) {
      return { success: false, error: 'Terjadi kesalahan, silakan coba lagi' }
    }
  }

  async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return { success: false, error: handleAuthError(error) }
      return { success: true }
    } catch (error) {
      return { success: false, error: 'Terjadi kesalahan, silakan coba lagi' }
    }
  }
}

export const authService = new AuthService()
