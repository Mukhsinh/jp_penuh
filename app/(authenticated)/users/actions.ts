'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateUserListPDF } from '@/lib/export/pdf-export'

export interface UserWithPegawai {
  id: string
  email: string
  role: 'superadmin' | 'unit_manager' | 'employee'
  employee_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  pegawai: {
    id: string
    employee_code: string
    full_name: string
    unit_id: string
    tax_status: string
    is_active: boolean
  } | null
  unit: {
    id: string
    name: string
    code?: string
  } | null
}

const SUPERADMIN_EMAIL = 'admin@sungaipenuh.com'

/**
 * Server action to get users from m_employees joined with auth
 */
export async function getUsers(
  page: number = 1,
  pageSize: number = 50,
  searchTerm: string = '',
  roleFilter: string = 'all'
): Promise<{ data: UserWithPegawai[]; count: number; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return { data: [], count: 0, error: 'Tidak terautentikasi' }
    }

    const email = authUser.email
    const isSuperAdmin = (
      authUser.app_metadata?.role === 'superadmin' ||
      authUser.user_metadata?.role === 'superadmin' ||
      email === SUPERADMIN_EMAIL
    )

    const adminClient = await createAdminClient()
    const effectiveClient = isSuperAdmin ? adminClient : supabase

    // Get employees with user_id
    let query = effectiveClient
      .from('m_employees')
      .select(`
        id,
        employee_code,
        full_name,
        unit_id,
        tax_status,
        is_active,
        user_id,
        role,
        created_at,
        updated_at,
        m_units(id, name, code)
      `, { count: 'exact' })
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false })

    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,employee_code.ilike.%${searchTerm}%`)
    }

    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return { data: [], count: 0, error: error.message }
    }

    // Get ALL auth users to ensure we find everyone (paginate if needed, but for now 1000 is likely enough)
    const { data: authUsersData, error: authError } = await adminClient.auth.admin.listUsers({
      perPage: 1000
    })

    if (authError) {
      console.error('Error fetching auth users:', authError)
      return { data: [], count: 0, error: authError.message }
    }

    const authUsers = authUsersData.users

    const transformedData: UserWithPegawai[] = (data || []).map((employee: any) => {
      const authUser = authUsers.find((u: any) => u.id === employee.user_id)
      const unit = Array.isArray(employee.m_units) ? employee.m_units[0] : employee.m_units
      const email = authUser?.email || ''

      // Robust role detection
      let detectedRole = authUser?.user_metadata?.role || authUser?.app_metadata?.role || employee.role || 'employee'
      if (email === SUPERADMIN_EMAIL) {
        detectedRole = 'superadmin'
      }

      return {
        id: employee.user_id,
        email: email,
        role: detectedRole as any,
        employee_id: employee.id,
        is_active: employee.is_active,
        created_at: employee.created_at,
        updated_at: employee.updated_at,
        pegawai: {
          id: employee.id,
          employee_code: employee.employee_code,
          full_name: employee.full_name,
          unit_id: employee.unit_id,
          tax_status: employee.tax_status,
          is_active: employee.is_active
        },
        unit: unit || null
      }
    })

    return { data: transformedData, count: count || 0 }
  } catch (err: any) {
    console.error('getUsers error:', err)
    return { data: [], count: 0, error: err.message }
  }
}

/**
 * Server action to get employees for user creation dropdown
 * Fetches employees who DON'T have a user_id yet
 */
export async function getEmployeesForUserCreation(): Promise<{ data: any[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Tidak terautentikasi' }

    const isSuperAdmin = (
      user.app_metadata?.role === 'superadmin' ||
      user.user_metadata?.role === 'superadmin' ||
      user.email === SUPERADMIN_EMAIL
    )

    if (!isSuperAdmin) {
      return { data: [], error: 'Tidak memiliki akses' }
    }

    const adminSupabase = await createAdminClient()
    // Modified: Also allow fetching ALL if needed, but primarily those WITHOUT user_id
    const { data, error } = await adminSupabase
      .from('m_employees')
      .select('id, employee_code, full_name, unit_id, role, user_id')
      .eq('is_active', true)
      .order('full_name')

    if (error) return { data: [], error: error.message }
    return { data: data || [] }
  } catch (err: any) {
    console.error('getEmployeesForUserCreation error:', err)
    return { data: [], error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to export user list to PDF
 */
export async function exportUserListToPDF(searchTerm: string = '', roleFilter: string = 'superadmin'): Promise<{ data?: string; error?: string }> {
  try {
    const { data: users, error } = await getUsers(1, 1000, searchTerm, roleFilter) // Get top 1000 users for export

    if (error) throw new Error(error)

    const formattedData = users.map(u => ({
      username: u.email || (u.pegawai?.employee_code ? `${u.pegawai.employee_code.toLowerCase()}@sungaipenuh.com` : '-'),
      display_name: u.pegawai?.full_name || '-',
      unit_name: u.unit?.name || '-',
      unit_code: u.unit?.code || '-',
      role_name: u.role === 'superadmin' ? 'Super Admin' : (u.role === 'unit_manager' ? 'Manajer Unit' : 'Pegawai'),
      is_active: u.is_active
    }))

    const pdfBytes = await generateUserListPDF(formattedData)
    const base64 = Buffer.from(pdfBytes).toString('base64')

    return { data: base64 }
  } catch (err: any) {
    console.error('exportUserListToPDF error:', err)
    return { error: err.message || 'Gagal mengekspor PDF' }
  }
}
