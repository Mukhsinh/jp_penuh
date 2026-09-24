import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/navigation/Sidebar'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Footer } from '@/components/layout/Footer'
import { getCachedUser } from '@/lib/supabase/auth-helper'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Verify session safely using request-level cache to prevent AuthApiError 429
  const user = await getCachedUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      {/* pt-14 on mobile gives space below the fixed hamburger button */}
      <main className="flex-1 overflow-y-auto flex flex-col pt-14 lg:pt-0 transition-all duration-300 main-content">
        <div className="flex-1 w-full overflow-x-hidden">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
        <Footer />
      </main>
    </div>
  )
}
