'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Pegawai, CreatePegawaiData, UpdatePegawaiData } from '@/lib/types/database.types'
import { isSuperAdmin as checkSuperAdmin, isUnitManager as checkUnitManager } from '@/lib/auth-utils'

/**
 * Server action to get pegawai with unit data
 */
export async function getPegawaiWithUnits(
  page: number = 1,
  pageSize: number = 50,
  searchTerm: string = '',
  unitId?: string
): Promise<{ data: Pegawai[]; count: number; error?: string }> {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], count: 0, error: 'Tidak terautentikasi' }
    }

    const isSuperAdmin = checkSuperAdmin(user as any)
    const isUnitManager = checkUnitManager(user as any)

    if (!isSuperAdmin && !isUnitManager) {
      return { data: [], count: 0, error: 'Tidak memiliki akses' }
    }

    // Use admin client for superadmin to bypass RLS, otherwise use anon client
    const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

    let query = fetchClient
      .from('m_employees')
      .select('*, m_units(name)', { count: 'exact' })
      .neq('role', 'superadmin')

    // If unit manager, only show their own unit
    if (isUnitManager && user.user_metadata?.unit_id) {
      query = query.eq('unit_id', user.user_metadata.unit_id)
    }

    query = query.order('employee_code', { ascending: false })

    // Apply search filter
    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,employee_code.ilike.%${searchTerm}%,position.ilike.%${searchTerm}%,employment_status.ilike.%${searchTerm}%`)
    }

    // Apply unit filter
    if (unitId && unitId !== 'all') {
      query = query.eq('unit_id', unitId)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('Query error:', error)
      return { data: [], count: 0, error: error.message }
    }

    // Transform data to match Pegawai type
    const transformedData: Pegawai[] = (data || []).map((item: any) => ({
      ...item,
      m_units: item.m_units || undefined
    }))

    return { data: transformedData, count: count || 0 }
  } catch (err: any) {
    console.error('getPegawaiWithUnits error:', err)
    return { data: [], count: 0, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to create new pegawai
 */
export async function createPegawai(data: CreatePegawaiData) {
  try {
    const supabase = await createAdminClient()

    // Fetch global tax mechanism from settings
    const { data: taxSetting } = await supabase
      .from('t_settings')
      .select('value')
      .eq('key', 'tax_config')
      .single()

    const mechanism = (taxSetting?.value as any)?.mechanism || 'TER'
    const taxType = mechanism === 'ter' || mechanism === 'TER' ? 'TER' : 'Final'

    // Log data for debugging
    console.log('Creating employee with data:', data, 'using taxType:', taxType)

    const fallbackEmail = `${data.employee_code.toLowerCase().replace(/[^a-z0-9]/g, '')}@sungaibahar.local`
    const finalEmail = data.email?.trim() || fallbackEmail

    const { data: newPegawai, error } = await supabase
      .from('m_employees')
      .insert([{
        employee_code: data.employee_code,
        full_name: data.full_name,
        email: finalEmail,
        unit_id: data.unit_id,
        tax_status: data.tax_status || 'TK/0',
        tax_type: taxType as any,
        nik: data.nik || null,
        bank_name: data.bank_name || null,
        bank_account_number: data.bank_account_number || null,
        bank_account_name: data.bank_account_name || null,
        position: data.position || null,
        phone: data.phone || null,
        role: data.role || 'employee',
        employee_status: data.employee_status || (data.employment_status || 'PNS'),
        employment_status: data.employment_status || 'PNS',
        pns_grade: data.pns_grade ? String(data.pns_grade) : null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      }])
      .select()
      .single()

    if (error) {
      console.error('Insert error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/pegawai')
    return { success: true }
  } catch (err: any) {
    console.error('createPegawai error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to update pegawai
 */
export async function updatePegawai(id: string, data: UpdatePegawaiData): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Verify user is superadmin
    const { data: { user } } = await supabase.auth.getUser()
    const authRole = user?.app_metadata?.role || user?.user_metadata?.role
    const isSuperAdmin = authRole === 'superadmin' || user?.email === 'admin@sungaibahar.com'
    const isUnitManager = authRole === 'unit_manager'

    if (!user || (!isSuperAdmin && !isUnitManager)) {
      return { success: false, error: 'Tidak memiliki akses' }
    }

    // Use admin client to bypass RLS and ensure all columns are written
    const adminSupabase = await createAdminClient()

    const code = data.employee_code || ''
    const fallbackEmail = `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}@sungaibahar.local`
    const finalEmail = data.email?.trim() || fallbackEmail

    // If unit manager, ensure they only update employees in their unit
    let updateQuery = adminSupabase
      .from('m_employees')
      .update({
        employee_code: data.employee_code,
        full_name: data.full_name,
        email: finalEmail,
        unit_id: isSuperAdmin ? data.unit_id : user.user_metadata?.unit_id,
        position: data.position || null,
        phone: data.phone || null,
        nik: data.nik || null,
        bank_name: data.bank_name || null,
        bank_account_number: data.bank_account_number || null,
        bank_account_name: data.bank_account_name || null,
        tax_status: data.tax_status,
        tax_type: data.tax_type,
        employment_status: data.employment_status,
        employee_status: data.employee_status || (data.employment_status as string),
        pns_grade: data.pns_grade !== undefined ? String(data.pns_grade) : null,
        is_active: data.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (isUnitManager) {
      updateQuery = updateQuery.eq('unit_id', user.user_metadata?.unit_id)
    }

    const { error } = await updateQuery

    if (error) {
      console.error('Update error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/pegawai')
    return { success: true }
  } catch (err: any) {
    console.error('updatePegawai error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to delete pegawai
 */
export async function deletePegawai(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Verify user is superadmin
    const { data: { user } } = await supabase.auth.getUser()
    const authRole = user?.app_metadata?.role || user?.user_metadata?.role
    const isSuperAdmin = authRole === 'superadmin' || user?.email === 'admin@sungaibahar.com'
    const isUnitManager = authRole === 'unit_manager'

    if (!user || (!isSuperAdmin && !isUnitManager)) {
      return { success: false, error: 'Tidak memiliki akses' }
    }

    let deleteQuery = supabase
      .from('m_employees')
      .delete()
      .eq('id', id)

    if (isUnitManager) {
      deleteQuery = deleteQuery.eq('unit_id', user.user_metadata?.unit_id)
    }

    const { error } = await deleteQuery

    if (error) {
      console.error('Delete error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/pegawai')
    return { success: true }
  } catch (err: any) {
    console.error('deletePegawai error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to get all units for dropdown
 */
export async function getUnitsForDropdown(): Promise<{ data: Array<{ id: string; name: string }>; error?: string }> {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], error: 'Tidak terautentikasi' }
    }

    const appRole = user.app_metadata?.role
    const userRole = user.user_metadata?.role
    const email = user.email

    const isSuperAdmin =
      appRole === 'superadmin' ||
      userRole === 'superadmin' ||
      email === 'admin@sungaibahar.com'

    // Use admin client for superadmin to bypass RLS
    const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

    const { data, error } = await fetchClient
      .from('m_units')
      .select('id, name')
      .eq('is_active', true)
      .neq('code', 'ADMIN')
      .order('name')

    if (error) {
      console.error('Units query error:', error)
      return { data: [], error: error.message }
    }

    return { data: data || [] }
  } catch (err: any) {
    console.error('getUnitsForDropdown error:', err)
    return { data: [], error: err.message || 'Terjadi kesalahan' }
  }
}
/**
 * Server action to get aggregate stats for pegawai dashboard
 */
export async function getPegawaiStats(unitId?: string): Promise<{
  total: number;
  byGrade: Array<{ name: string; value: number }>;
  byStatus: Array<{ name: string; value: number }>;
  byUnit: Array<{ name: string; value: number }>;
  error?: string;
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { total: 0, byGrade: [], byStatus: [], byUnit: [], error: 'Unauthorized' }

    const adminSupabase = await createAdminClient()

    // Fetch all active employees (excluding superadmin and ADMIN unit)
    let query = adminSupabase
      .from('m_employees')
      .select('pns_grade, employment_status, unit_id, m_units!inner(name, code)')
      .eq('is_active', true)
      .neq('role', 'superadmin')
      .neq('m_units.code', 'ADMIN')

    // Apply unit filter
    if (unitId && unitId !== 'all') {
      query = query.eq('unit_id', unitId)
    }

    const { data, error } = await query

    if (error) throw error

    const total = data.length
    const gradeMap = new Map<string, number>()
    const statusMap = new Map<string, number>()
    const unitMap = new Map<string, number>()

    data.forEach(p => {
      // Grade stats
      const grade = p.pns_grade || 'Non-PNS'
      gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1)

      // Status stats
      const status = p.employment_status || 'Lainnya'
      statusMap.set(status, (statusMap.get(status) || 0) + 1)

      // Unit stats
      const unitData = p.m_units
      const unitName = Array.isArray(unitData)
        ? unitData[0]?.name
        : (unitData as any)?.name || 'Tanpa Unit'
      unitMap.set(unitName, (unitMap.get(unitName) || 0) + 1)
    })

    const byGrade = Array.from(gradeMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    const byStatus = Array.from(statusMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    const byUnit = Array.from(unitMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    return { total, byGrade, byStatus, byUnit }
  } catch (err: any) {
    console.error('getPegawaiStats error:', err)
    return { total: 0, byGrade: [], byStatus: [], byUnit: [], error: err.message }
  }
}
