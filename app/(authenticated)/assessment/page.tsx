import { Suspense } from 'react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import AssessmentPageContent from '@/components/assessment/AssessmentPageContent'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getAvailablePeriods(supabase: any): Promise<string[]> {
  try {
    // 1. Fetch periods from t_pool
    const { data: poolData } = await supabase
      .from('t_pool')
      .select('period')
      .order('period', { ascending: false })

    const periodsSet = new Set<string>()
    poolData?.forEach((item: any) => {
      if (item.period) periodsSet.add(item.period)
    })

    // 2. Fetch distinct periods from t_kpi_assessments
    const { data: assData } = await supabase
      .from('t_kpi_assessments')
      .select('period')
      .limit(200)

    assData?.forEach((item: any) => {
      if (item.period) periodsSet.add(item.period)
    })

    // 3. Fallback: Always include current period (YYYY-MM)
    const currentMonth = new Date().toISOString().slice(0, 7)
    periodsSet.add(currentMonth)

    return Array.from(periodsSet).sort((a, b) => b.localeCompare(a))
  } catch (error) {
    console.error('Exception in getAvailablePeriods:', error)
    return [new Date().toISOString().slice(0, 7)]
  }
}

export default async function AssessmentPage() {
  try {
    const supabase = await createClient()

    // Get user safely using rate-limit-resistant auth-helper
    const user = await getAuthenticatedUser(supabase)
    if (!user) {
      redirect('/login')
    }

    const availablePeriods = await getAvailablePeriods(supabase)

    const authRole = user.role || user.app_metadata?.role || user.user_metadata?.role
    const isSuperAdmin = authRole === 'superadmin' || user.email === 'admin@sungaipenuh.com'

    const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

    // Get current user's employee record with error handling
    let currentEmployee: any = null
    try {
      const { data: byUserId } = await fetchClient
        .from('m_employees')
        .select('id, role, unit_id, full_name')
        .eq('user_id', user.id)
        .maybeSingle()

      if (byUserId) {
        currentEmployee = byUserId
      } else if (user.email) {
        const { data: empByEmail } = await fetchClient
          .from('m_employees')
          .select('id, role, unit_id, full_name, user_id')
          .eq('email', user.email)
          .maybeSingle()

        if (empByEmail) {
          currentEmployee = empByEmail
          if (!empByEmail.user_id) {
            const adminClient = await createAdminClient()
            await adminClient.from('m_employees').update({ user_id: user.id }).eq('id', empByEmail.id)
          }
        }
      }
    } catch (err) {
      console.error('Error fetching employee record for assessment page:', err)
    }

    if (!currentEmployee) {
      if (isSuperAdmin || authRole === 'admin') {
        currentEmployee = {
          id: user.id,
          full_name: user.user_metadata?.full_name || 'Super Administrator',
          role: 'superadmin',
          unit_id: '0'
        }
      } else {
        currentEmployee = {
          id: user.id,
          full_name: user.email || 'Pengguna',
          role: 'unit_manager',
          unit_id: 'all'
        }
      }
    }

    // Use database role if defined, otherwise fallback to Auth metadata for superadmin detection
    if ((!currentEmployee.role || currentEmployee.role === 'employee') && isSuperAdmin) {
      currentEmployee.role = 'superadmin'
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Penilaian KPI</h1>
          <p className="text-gray-600">
            Kelola penilaian kinerja pegawai berdasarkan indikator KPI yang telah dikonfigurasi
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }>
          <AssessmentPageContent
            currentEmployee={currentEmployee}
            availablePeriods={availablePeriods}
          />
        </Suspense>
      </div>
    )
  } catch (error: any) {
    if (isRedirectError(error)) {
      throw error
    }
    console.error('Assessment page error:', error)
    redirect('/dashboard')
  }
}
