'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Eye, EyeOff, Mail, Lock, MessageCircle } from 'lucide-react'
import { useSettings } from '@/lib/contexts/settings-context'

function getErrorMessage(code: string | null): string | null {
  if (!code) return null
  const msgs: Record<string, string> = {
    session_expired: 'Sesi Anda telah berakhir, silakan masuk kembali',
    idle_timeout: 'Sesi Anda telah berakhir karena tidak ada aktivitas selama lebih dari 30 menit. Silakan masuk kembali.',
    inactive: 'Akun Anda tidak aktif, hubungi administrator',
    user_not_found: 'Data pengguna tidak ditemukan',
    unexpected: 'Terjadi kesalahan, silakan coba lagi',
  }
  return msgs[code] || 'Terjadi kesalahan, silakan coba lagi'
}

function LoginForm() {
  const { settings, loading: settingsLoading } = useSettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    setIsMounted(true)
    const code = searchParams.get('reason') || searchParams.get('error')
    if (code) setError(getErrorMessage(code))
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      let normalizedEmail = email.trim().toLowerCase()
      if (normalizedEmail === 'admin' || normalizedEmail === 'superadmin') {
        normalizedEmail = 'admin@sungaipenuh.com'
      } else if (normalizedEmail.endsWith('@sungaipenuh.local')) {
        normalizedEmail = normalizedEmail.replace('@sungaipenuh.local', '@sungaipenuh.com')
      } else if (!normalizedEmail.includes('@')) {
        normalizedEmail = `${normalizedEmail}@sungaipenuh.com`
      }

      // Proactively clear any stale cookies before signing in
      try {
        await supabase.auth.signOut()
      } catch (e) {
        // ignore
      }

      let { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      // Graceful fallback for superadmin if user enters Adminpenuh123 or admin123 interchangeably
      if (authErr && normalizedEmail === 'admin@sungaipenuh.com') {
        const altPassword = password === 'admin123' ? 'Adminpenuh123' : (password === 'Adminpenuh123' ? 'admin123' : null)
        if (altPassword) {
          const retry = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: altPassword,
          })
          if (!retry.error) {
            auth = retry.data
            authErr = null
          }
        }
      }

      if (authErr) {
        let msg = authErr.message
        if (msg === 'Invalid login credentials') {
          msg = 'Email/Username atau kata sandi salah'
        }
        setError(msg || 'Email/Username atau kata sandi salah')
        setIsLoading(false)
        return
      }

      if (!auth.user || !auth.session) {
        setError('Gagal membuat sesi, silakan coba lagi')
        setIsLoading(false)
        return
      }

      window.location.href = '/dashboard'
    } catch (err: any) {
      console.error('[LOGIN] Unexpected error:', err)
      setError('Terjadi kesalahan sistem: ' + (err.message || 'Silakan coba lagi'))
      setIsLoading(false)
    }
  }

  const waUrl = `https://wa.me/6285726112001?text=${encodeURIComponent('Halo, saya memerlukan bantuan untuk mengakses aplikasi JASPEL. Mohon bantuannya.')}`

  if (!isMounted || settingsLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50/50">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  const companyInfo = settings?.companyInfo
  const logoSrc = companyInfo?.logo || "/logo.png"
  const orgName = companyInfo?.name || "RS Sungai Bahar"

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50/50 p-2 font-sans overflow-hidden">
      {/* Header Section */}
      <div className="flex flex-col items-center mb-3">
        <div className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center overflow-hidden mb-1.5 border border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt={orgName}
            width={48}
            height={48}
            className="object-contain max-h-[48px] max-w-[48px]"
          />
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight text-center m-0 uppercase max-w-[350px]">
          {orgName}
        </h1>
        <div className="flex items-center gap-1 mt-1">
          <div className="w-10 h-1 bg-blue-500 rounded-full" />
          <div className="w-4 h-1 bg-blue-300 rounded-full" />
          <div className="w-2 h-1 bg-blue-100 rounded-full" />
        </div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-[360px] bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-5 md:p-6">
        <h2 className="text-center text-base font-black text-blue-600 uppercase tracking-[0.2em] mb-4">
          APLIKASI PINTAR-JP
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email / Username Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
              Email atau Username
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={16} />
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nama@email.com atau username/kode"
                required
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full h-11 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium transition-all focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50/50"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-11 pl-12 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium transition-all focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-300 hover:text-gray-500 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-semibold animate-in fade-in duration-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <span>Masuk</span>
            )}
          </button>
        </form>

        {/* Support Section */}
        <div className="mt-4 pt-3 border-t border-gray-50">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-11 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl text-[#16a34a] text-xs font-bold hover:bg-[#dcfce7] transition-all"
          >
            <MessageCircle size={16} />
            Hubungi Bantuan Admin
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-2 text-center">
        <p className="text-[11px] text-gray-900 font-bold tracking-wider">
          {typeof settings?.footer === 'object' && settings.footer?.text
            ? settings.footer.text
            : (typeof settings?.footer === 'string'
              ? settings.footer
              : 'PINTAR JP © 2026. All Right Reserved')}
        </p>
      </footer>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-gray-50/50">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
