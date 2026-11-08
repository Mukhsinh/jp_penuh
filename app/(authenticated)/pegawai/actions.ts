'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Pegawai, CreatePegawaiData, UpdatePegawaiData, EmployeePeriod } from '@/lib/types/database.types'
import { isSuperAdmin as checkSuperAdmin, isUnitManager as checkUnitManager } from '@/lib/auth-utils'
import { formatPeriodToMonthName } from '@/lib/utils/format'
import {
  getEmployeePeriods,
  lockEmployeePeriod,
  unlockEmployeePeriod,
  createNextEmployeePeriod,
  clearDraftEmployeePeriod,
  getNextEmployeeCode,
  rotateEmployeeUnit,
  ensureDefaultPeriodEstablished
} from '@/lib/services/employee-period.service'

/**
 * Server action to get employee periods list
 */
export async function getEmployeePeriodsAction(): Promise<{ data: EmployeePeriod[]; error?: string }> {
  return await getEmployeePeriods()
}

/**
 * Server action to lock a period
 */
export async function lockEmployeePeriodAction(period: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi' }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) return { success: false, error: 'Hanya Super Administrator yang berhak mengunci periode' }

    const userName = user.user_metadata?.full_name || user.email || 'Administrator'
    const result = await lockEmployeePeriod(period, userName)
    if (result.success) {
      revalidatePath('/pegawai')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }
    return result
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal mengunci periode' }
  }
}

/**
 * Server action to unlock a period
 */
export async function unlockEmployeePeriodAction(period: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi' }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) return { success: false, error: 'Hanya Super Administrator yang berhak membuka kunci periode' }

    const result = await unlockEmployeePeriod(period)
    if (result.success) {
      revalidatePath('/pegawai')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }
    return result
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal membuka kunci periode' }
  }
}

/**
 * Server action to get the next auto-generated employee code
 */
export async function getNextEmployeeCodeAction(): Promise<{ code: string; error?: string }> {
  try {
    const code = await getNextEmployeeCode()
    return { code }
  } catch (err: any) {
    console.error('getNextEmployeeCodeAction error:', err)
    return { code: 'PEG001', error: err.message }
  }
}

/**
 * Server action to clear data and delete a draft period
 */
export async function clearDraftEmployeePeriodAction(
  period: string
): Promise<{ success: boolean; nextPeriod?: string; nextPeriodInfo?: any; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi' }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) return { success: false, error: 'Hanya Superadmin yang memiliki akses untuk mereset periode' }

    const result = await clearDraftEmployeePeriod(period)
    if (result.success) {
      revalidatePath('/pegawai')
      revalidatePath('/units')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }
    return result
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal mereset data periode' }
  }
}

/**
 * Server action to create a new period and copy assignments
 */
export async function createNextPeriodAction(
  newPeriod: string,
  sourcePeriod?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi' }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) return { success: false, error: 'Hanya Super Administrator yang berhak membuat periode baru' }

    const result = await createNextEmployeePeriod(newPeriod, sourcePeriod)
    if (result.success) {
      revalidatePath('/pegawai')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }
    return result
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal membuat periode baru' }
  }
}

/**
 * Server action to quickly rotate an employee to a new unit
 */
export async function rotateEmployeeUnitAction(
  period: string,
  employeeId: string,
  newUnitId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi' }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) return { success: false, error: 'Tidak memiliki akses untuk rotasi pegawai' }

    const result = await rotateEmployeeUnit(period, employeeId, newUnitId)
    if (result.success) {
      revalidatePath('/pegawai')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }
    return result
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal memindahkan pegawai' }
  }
}

/**
 * Server action to get pegawai with unit data (respecting period snapshot if available)
 */
export async function getPegawaiWithUnits(
  page: number = 1,
  pageSize: number = 50,
  searchTerm: string = '',
  unitId?: string,
  period?: string
): Promise<{
  data: Pegawai[];
  count: number;
  error?: string;
  periodInfo?: { is_locked: boolean; period_name: string; locked_at?: string | null; locked_by?: string | null }
}> {
  try {
    await ensureDefaultPeriodEstablished()
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

    // Check if period is specified and check if snapshot exists
    let useSnapshot = false
    let periodInfo: any = null

    if (period) {
      const { data: periodRow } = await fetchClient
        .from('t_employee_periods')
        .select('*')
        .eq('period', period)
        .maybeSingle()

      if (periodRow) {
        periodInfo = {
          is_locked: periodRow.is_locked,
          period_name: periodRow.period_name || formatPeriodToMonthName(period),
          locked_at: periodRow.locked_at,
          locked_by: periodRow.locked_by
        }
        useSnapshot = true
      } else {
        const { count: snapCount } = await fetchClient
          .from('t_employee_period_snapshots')
          .select('id', { count: 'exact', head: true })
          .eq('period', period)

        if (snapCount && snapCount > 0) {
          useSnapshot = true
        }
      }
    }

    let query: any
    if (useSnapshot && period) {
      query = fetchClient
        .from('t_employee_period_snapshots')
        .select('*, m_units(id, name, code)', { count: 'exact' })
        .eq('period', period)
        .neq('role', 'superadmin')
    } else {
      query = fetchClient
        .from('m_employees')
        .select('*, m_units(id, name, code)', { count: 'exact' })
        .neq('role', 'superadmin')
    }

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
      console.error('Query error in getPegawaiWithUnits:', error)
      return { data: [], count: 0, error: error.message }
    }

    // Filter out superadmin role AND superadmin unit employees
    const filteredRows = (data || []).filter((item: any) => {
      if (item.role === 'superadmin') return false
      const unit = Array.isArray(item.m_units) ? item.m_units[0] : item.m_units
      const code = String(unit?.code || '').toUpperCase()
      const name = String(unit?.name || '').toUpperCase()
      if (code === 'ADMIN' || code === 'SUPERADMIN' || name.includes('SUPERADMIN')) return false
      return true
    })

    // Transform data to match Pegawai type
    const transformedData: Pegawai[] = filteredRows.map((item: any) => ({
      ...item,
      id: useSnapshot ? item.employee_id : item.id, // Ensure id points to employee ID
      m_units: item.m_units || undefined
    }))

    return { data: transformedData, count: count || 0, periodInfo }
  } catch (err: any) {
    console.error('getPegawaiWithUnits error:', err)
    return { data: [], count: 0, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to create new pegawai
 */
export async function createPegawai(data: CreatePegawaiData, period?: string) {
  try {
    const supabase = await createAdminClient()

    // If period is provided, check if locked
    if (period) {
      const { data: periodRow } = await supabase
        .from('t_employee_periods')
        .select('is_locked, period_name')
        .eq('period', period)
        .maybeSingle()

      if (periodRow?.is_locked) {
        return {
          success: false,
          error: `Periode ${periodRow.period_name || period} telah dikunci. Penambahan pegawai baru tidak dapat dilakukan pada periode yang sudah dikunci.`
        }
      }
    }

    // Fetch global tax mechanism from settings
    const { data: taxSetting } = await supabase
      .from('t_settings')
      .select('value')
      .eq('key', 'tax_config')
      .single()

    const mechanism = (taxSetting?.value as any)?.mechanism || 'TER'
    const taxType = mechanism === 'ter' || mechanism === 'TER' ? 'TER' : 'Final'

    console.log('Creating employee with data:', data, 'using taxType:', taxType)

    const fallbackEmail = `${data.employee_code.toLowerCase().replace(/[^a-z0-9]/g, '')}@sungaipenuh.local`
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

    // If period is specified and unlocked, also insert into t_employee_period_snapshots
    if (period && newPegawai) {
      await supabase
        .from('t_employee_period_snapshots')
        .upsert([{
          period,
          employee_id: newPegawai.id,
          employee_code: newPegawai.employee_code,
          full_name: newPegawai.full_name,
          unit_id: newPegawai.unit_id,
          position: newPegawai.position,
          role: newPegawai.role,
          employee_status: newPegawai.employee_status,
          employment_status: newPegawai.employment_status,
          pns_grade: newPegawai.pns_grade,
          tax_status: newPegawai.tax_status,
          tax_type: newPegawai.tax_type,
          nik: newPegawai.nik,
          bank_name: newPegawai.bank_name,
          bank_account_number: newPegawai.bank_account_number,
          bank_account_name: newPegawai.bank_account_name,
          phone: newPegawai.phone,
          email: newPegawai.email,
          is_active: newPegawai.is_active
        }], { onConflict: 'period,employee_id' })
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
export async function updatePegawai(
  id: string,
  data: UpdatePegawaiData,
  period?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Verify user is superadmin or unit manager
    const { data: { user } } = await supabase.auth.getUser()
    const authRole = user?.app_metadata?.role || user?.user_metadata?.role
    const isSuperAdmin = authRole === 'superadmin' || user?.email === 'admin@sungaipenuh.com'
    const isUnitManager = authRole === 'unit_manager'

    if (!user || (!isSuperAdmin && !isUnitManager)) {
      return { success: false, error: 'Tidak memiliki akses' }
    }

    const adminSupabase = await createAdminClient()

    // Check period lock status
    if (period) {
      const { data: periodRow } = await adminSupabase
        .from('t_employee_periods')
        .select('is_locked, period_name')
        .eq('period', period)
        .maybeSingle()

      if (periodRow?.is_locked) {
        return {
          success: false,
          error: `Periode ${periodRow.period_name || period} telah dikunci. Data pegawai pada periode ini tidak dapat diubah.`
        }
      }
    }

    const code = data.employee_code || ''
    const fallbackEmail = `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}@sungaipenuh.local`
    const finalEmail = data.email?.trim() || fallbackEmail

    const assignedUnitId = isSuperAdmin ? data.unit_id : user.user_metadata?.unit_id

    // Update in period snapshot if period is specified
    if (period) {
      const { error: snapErr } = await adminSupabase
        .from('t_employee_period_snapshots')
        .update({
          employee_code: data.employee_code,
          full_name: data.full_name,
          email: finalEmail,
          unit_id: assignedUnitId,
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
        .eq('period', period)
        .eq('employee_id', id)

      if (snapErr) {
        console.error('Update snapshot error:', snapErr)
      }
    }

    // Check if this update should also sync to m_employees (if no period or if period is latest open period)
    let syncToMaster = true
    if (period) {
      const { data: laterPeriods } = await adminSupabase
        .from('t_employee_periods')
        .select('period')
        .gt('period', period)
        .limit(1)

      if (laterPeriods && laterPeriods.length > 0) {
        syncToMaster = false // Do not overwrite master with old period edits
      }
    }

    if (syncToMaster) {
      let updateQuery = adminSupabase
        .from('m_employees')
        .update({
          employee_code: data.employee_code,
          full_name: data.full_name,
          email: finalEmail,
          unit_id: assignedUnitId,
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
        console.error('Update error in master:', error)
        return { success: false, error: error.message }
      }
    }

    revalidatePath('/pegawai')
    revalidatePath('/assessment')
    revalidatePath('/reports')
    return { success: true }
  } catch (err: any) {
    console.error('updatePegawai error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to delete pegawai
 */
export async function deletePegawai(id: string, period?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    const authRole = user?.app_metadata?.role || user?.user_metadata?.role
    const isSuperAdmin = authRole === 'superadmin' || user?.email === 'admin@sungaipenuh.com'
    const isUnitManager = authRole === 'unit_manager'

    if (!user || (!isSuperAdmin && !isUnitManager)) {
      return { success: false, error: 'Tidak memiliki akses' }
    }

    const adminSupabase = await createAdminClient()

    // If period is provided, check if locked
    if (period) {
      const { data: periodRow } = await adminSupabase
        .from('t_employee_periods')
        .select('is_locked, period_name')
        .eq('period', period)
        .maybeSingle()

      if (periodRow?.is_locked) {
        return {
          success: false,
          error: `Periode ${periodRow.period_name || period} telah dikunci. Pegawai tidak dapat dihapus pada periode yang sudah dikunci.`
        }
      }
    }

    let deleteQuery = adminSupabase
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
    revalidatePath('/assessment')
    revalidatePath('/reports')
    return { success: true }
  } catch (err: any) {
    console.error('deletePegawai error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to activate pegawai
 */
export async function activatePegawai(id: string, period?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    const authRole = user?.app_metadata?.role || user?.user_metadata?.role
    const isSuperAdmin = authRole === 'superadmin' || user?.email === 'admin@sungaipenuh.com'
    const isUnitManager = authRole === 'unit_manager'

    if (!user || (!isSuperAdmin && !isUnitManager)) {
      return { success: false, error: 'Tidak memiliki akses' }
    }

    const adminSupabase = await createAdminClient()

    if (period) {
      const { data: periodRow } = await adminSupabase
        .from('t_employee_periods')
        .select('is_locked, period_name')
        .eq('period', period)
        .maybeSingle()

      if (periodRow?.is_locked) {
        return {
          success: false,
          error: `Periode ${periodRow.period_name || period} telah dikunci.`
        }
      }

      await adminSupabase
        .from('t_employee_period_snapshots')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('period', period)
        .eq('employee_id', id)
    }

    let updateQuery = adminSupabase
      .from('m_employees')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (isUnitManager) {
      updateQuery = updateQuery.eq('unit_id', user.user_metadata?.unit_id)
    }

    const { error } = await updateQuery

    if (error) {
      console.error('Activate error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/pegawai')
    revalidatePath('/assessment')
    revalidatePath('/reports')
    return { success: true }
  } catch (err: any) {
    console.error('activatePegawai error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to deactivate pegawai
 */
export async function deactivatePegawai(id: string, period?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    const authRole = user?.app_metadata?.role || user?.user_metadata?.role
    const isSuperAdmin = authRole === 'superadmin' || user?.email === 'admin@sungaipenuh.com'
    const isUnitManager = authRole === 'unit_manager'

    if (!user || (!isSuperAdmin && !isUnitManager)) {
      return { success: false, error: 'Tidak memiliki akses' }
    }

    const adminSupabase = await createAdminClient()

    if (period) {
      const { data: periodRow } = await adminSupabase
        .from('t_employee_periods')
        .select('is_locked, period_name')
        .eq('period', period)
        .maybeSingle()

      if (periodRow?.is_locked) {
        return {
          success: false,
          error: `Periode ${periodRow.period_name || period} telah dikunci.`
        }
      }

      await adminSupabase
        .from('t_employee_period_snapshots')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('period', period)
        .eq('employee_id', id)
    }

    let updateQuery = adminSupabase
      .from('m_employees')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (isUnitManager) {
      updateQuery = updateQuery.eq('unit_id', user.user_metadata?.unit_id)
    }

    const { error } = await updateQuery

    if (error) {
      console.error('Deactivate error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/pegawai')
    revalidatePath('/assessment')
    revalidatePath('/reports')
    return { success: true }
  } catch (err: any) {
    console.error('deactivatePegawai error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to get all units for dropdown
 */
export async function getUnitsForDropdown(): Promise<{ data: Array<{ id: string; name: string }>; error?: string }> {
  try {
    const supabase = await createClient()

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
      email === 'admin@sungaipenuh.com'

    const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

    const { data, error } = await fetchClient
      .from('m_units')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Units query error:', error)
      return { data: [], error: error.message }
    }

    const filteredData = (data || []).filter(u => {
      const code = String(u.code || '').toUpperCase()
      const name = String(u.name || '').toUpperCase()
      return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
    })

    return { data: filteredData }
  } catch (err: any) {
    console.error('getUnitsForDropdown error:', err)
    return { data: [], error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Server action to get aggregate stats for pegawai dashboard (respecting period)
 */
export async function getPegawaiStats(unitId?: string, period?: string): Promise<{
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

    let useSnapshot = false
    if (period) {
      const { data: periodRow } = await adminSupabase
        .from('t_employee_periods')
        .select('id')
        .eq('period', period)
        .maybeSingle()

      if (periodRow) {
        useSnapshot = true
      } else {
        const { count } = await adminSupabase
          .from('t_employee_period_snapshots')
          .select('id', { count: 'exact', head: true })
          .eq('period', period)

        if (count && count > 0) {
          useSnapshot = true
        }
      }
    }

    let query: any
    if (useSnapshot && period) {
      query = adminSupabase
        .from('t_employee_period_snapshots')
        .select('pns_grade, employment_status, unit_id, m_units!inner(name, code)')
        .eq('period', period)
        .eq('is_active', true)
        .neq('role', 'superadmin')
        .neq('m_units.code', 'ADMIN')
    } else {
      query = adminSupabase
        .from('m_employees')
        .select('pns_grade, employment_status, unit_id, m_units!inner(name, code)')
        .eq('is_active', true)
        .neq('role', 'superadmin')
        .neq('m_units.code', 'ADMIN')
    }

    // Apply unit filter
    if (unitId && unitId !== 'all') {
      query = query.eq('unit_id', unitId)
    }

    const { data, error } = await query

    if (error) throw error

    // Exclude superadmin unit employees
    const validEmps = (data || []).filter((p: any) => {
      const u = Array.isArray(p.m_units) ? p.m_units[0] : p.m_units
      const code = String(u?.code || '').toUpperCase()
      const name = String(u?.name || '').toUpperCase()
      return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
    })

    const total = validEmps.length
    const gradeMap = new Map<string, number>()
    const statusMap = new Map<string, number>()
    const unitMap = new Map<string, number>()

    validEmps.forEach((p: any) => {
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
