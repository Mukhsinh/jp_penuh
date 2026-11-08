'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import type { Pegawai, CreatePegawaiData, UpdatePegawaiData, EmployeePeriod } from '@/lib/types/database.types'
import { formatPeriodToMonthName } from '@/lib/utils/format'
import { createNextUnitPeriod } from '@/lib/services/unit-period.service'

/**
 * Ensure baseline period 2026-01 exists and is established
 */
export async function ensureDefaultPeriodEstablished() {
  const adminClient = await createAdminClient()

  // 1. Check if 2026-01 exists in t_employee_periods
  const { data: existingPeriod } = await adminClient
    .from('t_employee_periods')
    .select('*')
    .eq('period', '2026-01')
    .maybeSingle()

  if (!existingPeriod) {
    await adminClient
      .from('t_employee_periods')
      .insert([{
        period: '2026-01',
        period_name: 'Januari 2026',
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: 'Sistem Otomatis',
        notes: 'Periode awal Januari 2026 ditetapkan secara otomatis oleh sistem'
      }])
  }

  // 2. Check snapshot count for 2026-01
  const { count } = await adminClient
    .from('t_employee_period_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('period', '2026-01')

  if (!count || count === 0) {
    // Snapshot all current employees
    const { data: emps } = await adminClient
      .from('m_employees')
      .select('*')
      .neq('role', 'superadmin')

    if (emps && emps.length > 0) {
      const snapshots = emps.map(e => ({
        period: '2026-01',
        employee_id: e.id,
        employee_code: e.employee_code,
        full_name: e.full_name,
        unit_id: e.unit_id,
        position: e.position,
        role: e.role || 'employee',
        employee_status: e.employee_status,
        employment_status: e.employment_status,
        pns_grade: e.pns_grade,
        tax_status: e.tax_status,
        tax_type: e.tax_type,
        nik: e.nik,
        bank_name: e.bank_name,
        bank_account_number: e.bank_account_number,
        bank_account_name: e.bank_account_name,
        phone: e.phone,
        email: e.email,
        is_active: e.is_active !== undefined ? e.is_active : true
      }))

      // Batch insert in chunks of 200
      for (let i = 0; i < snapshots.length; i += 200) {
        const batch = snapshots.slice(i, i + 200)
        await adminClient.from('t_employee_period_snapshots').upsert(batch, { onConflict: 'period,employee_id' })
      }
    }
  }
}

/**
 * Fetch list of all employee periods
 */
export async function getEmployeePeriods(): Promise<{ data: EmployeePeriod[]; error?: string }> {
  try {
    await ensureDefaultPeriodEstablished()
    const adminClient = await createAdminClient()
    const { data, error } = await adminClient
      .from('t_employee_periods')
      .select('*')
      .order('period', { ascending: false })

    if (error) {
      console.error('Error fetching employee periods:', error)
      return { data: [], error: error.message }
    }

    return { data: data || [] }
  } catch (err: any) {
    console.error('Exception in getEmployeePeriods:', err)
    return { data: [], error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Lock an employee period
 */
export async function lockEmployeePeriod(period: string, lockedBy: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()

    // 1. Verify period exists
    let { data: periodRow } = await adminClient
      .from('t_employee_periods')
      .select('*')
      .eq('period', period)
      .maybeSingle()

    if (!periodRow) {
      const periodName = formatPeriodToMonthName(period)
      const { data: newRow, error: insertErr } = await adminClient
        .from('t_employee_periods')
        .insert([{
          period,
          period_name: periodName,
          is_locked: true,
          locked_at: new Date().toISOString(),
          locked_by: lockedBy || 'Admin'
        }])
        .select()
        .single()
      if (insertErr) throw insertErr
      periodRow = newRow
    }

    // 2. Ensure all employees are snapshotted for this period
    const { count } = await adminClient
      .from('t_employee_period_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('period', period)

    if (!count || count === 0) {
      // Find latest previous period snapshot or fallback to m_employees
      const { data: prevPeriods } = await adminClient
        .from('t_employee_periods')
        .select('period')
        .lt('period', period)
        .order('period', { ascending: false })
        .limit(1)

      const prevPeriod = prevPeriods?.[0]?.period
      let empsToSnapshot: any[] = []

      if (prevPeriod) {
        const { data: prevSnapshots } = await adminClient
          .from('t_employee_period_snapshots')
          .select('*')
          .eq('period', prevPeriod)
        empsToSnapshot = (prevSnapshots || []).map(s => ({
          ...s,
          id: undefined,
          period,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
      }

      if (empsToSnapshot.length === 0) {
        const { data: currentEmps } = await adminClient
          .from('m_employees')
          .select('*')
          .neq('role', 'superadmin')
        empsToSnapshot = (currentEmps || []).map(e => ({
          period,
          employee_id: e.id,
          employee_code: e.employee_code,
          full_name: e.full_name,
          unit_id: e.unit_id,
          position: e.position,
          role: e.role || 'employee',
          employee_status: e.employee_status,
          employment_status: e.employment_status,
          pns_grade: e.pns_grade,
          tax_status: e.tax_status,
          tax_type: e.tax_type,
          nik: e.nik,
          bank_name: e.bank_name,
          bank_account_number: e.bank_account_number,
          bank_account_name: e.bank_account_name,
          phone: e.phone,
          email: e.email,
          is_active: e.is_active !== undefined ? e.is_active : true
        }))
      }

      for (let i = 0; i < empsToSnapshot.length; i += 200) {
        const batch = empsToSnapshot.slice(i, i + 200)
        await adminClient.from('t_employee_period_snapshots').upsert(batch, { onConflict: 'period,employee_id' })
      }
    }

    // 3. Mark period as locked
    const { error: updateErr } = await adminClient
      .from('t_employee_periods')
      .update({
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: lockedBy || 'Admin',
        updated_at: new Date().toISOString()
      })
      .eq('period', period)

    if (updateErr) throw updateErr

    return { success: true }
  } catch (err: any) {
    console.error('lockEmployeePeriod error:', err)
    return { success: false, error: err.message || 'Gagal mengunci periode' }
  }
}

/**
 * Unlock an employee period (Superadmin only)
 */
export async function unlockEmployeePeriod(period: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()
    const { error } = await adminClient
      .from('t_employee_periods')
      .update({
        is_locked: false,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString()
      })
      .eq('period', period)

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error('unlockEmployeePeriod error:', err)
    return { success: false, error: err.message || 'Gagal membuka kunci periode' }
  }
}

/**
 * Create a new period (e.g., February 2026), copying active employees and assignments from sourcePeriod or latest period
 */
export async function createNextEmployeePeriod(
  newPeriod: string,
  sourcePeriod?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()

    // 1. Check if newPeriod already exists
    const { data: existing } = await adminClient
      .from('t_employee_periods')
      .select('*')
      .eq('period', newPeriod)
      .maybeSingle()

    const periodName = formatPeriodToMonthName(newPeriod)

    if (!existing) {
      const { error: insertErr } = await adminClient
        .from('t_employee_periods')
        .insert([{
          period: newPeriod,
          period_name: periodName,
          is_locked: false,
          notes: `Dibuka berdasarkan ${sourcePeriod || 'periode sebelumnya'}`
        }])

      if (insertErr) throw insertErr
    }

    // Ensure unit period and snapshots are also prepared for newPeriod
    await createNextUnitPeriod(newPeriod, sourcePeriod)

    // 2. Check if snapshots already exist for newPeriod
    const { count } = await adminClient
      .from('t_employee_period_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('period', newPeriod)

    if (!count || count === 0) {
      // Find source to copy from: specified sourcePeriod -> latest period -> m_employees
      let sourceToUse = sourcePeriod
      if (!sourceToUse) {
        const { data: latestPeriods } = await adminClient
          .from('t_employee_periods')
          .select('period')
          .lt('period', newPeriod)
          .order('period', { ascending: false })
          .limit(1)
        sourceToUse = latestPeriods?.[0]?.period || '2026-01'
      }

      let candidates: any[] = []
      if (sourceToUse) {
        const { data: sourceSnapshots } = await adminClient
          .from('t_employee_period_snapshots')
          .select('*')
          .eq('period', sourceToUse)

        if (sourceSnapshots && sourceSnapshots.length > 0) {
          candidates = sourceSnapshots.map(s => ({
            period: newPeriod,
            employee_id: s.employee_id,
            employee_code: s.employee_code,
            full_name: s.full_name,
            unit_id: s.unit_id,
            position: s.position,
            role: s.role || 'employee',
            employee_status: s.employee_status,
            employment_status: s.employment_status,
            pns_grade: s.pns_grade,
            tax_status: s.tax_status,
            tax_type: s.tax_type,
            nik: s.nik,
            bank_name: s.bank_name,
            bank_account_number: s.bank_account_number,
            bank_account_name: s.bank_account_name,
            phone: s.phone,
            email: s.email,
            is_active: s.is_active
          }))
        }
      }

      if (candidates.length === 0) {
        const { data: masterEmps } = await adminClient
          .from('m_employees')
          .select('*')
          .neq('role', 'superadmin')
        candidates = (masterEmps || []).map(e => ({
          period: newPeriod,
          employee_id: e.id,
          employee_code: e.employee_code,
          full_name: e.full_name,
          unit_id: e.unit_id,
          position: e.position,
          role: e.role || 'employee',
          employee_status: e.employee_status,
          employment_status: e.employment_status,
          pns_grade: e.pns_grade,
          tax_status: e.tax_status,
          tax_type: e.tax_type,
          nik: e.nik,
          bank_name: e.bank_name,
          bank_account_number: e.bank_account_number,
          bank_account_name: e.bank_account_name,
          phone: e.phone,
          email: e.email,
          is_active: e.is_active !== undefined ? e.is_active : true
        }))
      }

      for (let i = 0; i < candidates.length; i += 200) {
        const batch = candidates.slice(i, i + 200)
        await adminClient.from('t_employee_period_snapshots').upsert(batch, { onConflict: 'period,employee_id' })
      }
    }

    return { success: true }
  } catch (err: any) {
    console.error('createNextEmployeePeriod error:', err)
    return { success: false, error: err.message || 'Gagal membuat periode baru' }
  }
}

/**
 * Move / Rotate employee unit in a period (mutasi pegawai antar unit kerja)
 */
export async function rotateEmployeeUnit(
  period: string,
  employeeId: string,
  newUnitId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()

    // 1. Check if period is locked
    const { data: periodRow } = await adminClient
      .from('t_employee_periods')
      .select('is_locked, period_name')
      .eq('period', period)
      .maybeSingle()

    if (periodRow?.is_locked) {
      return {
        success: false,
        error: `Periode ${periodRow.period_name || period} telah dikunci dan tidak dapat diubah. Rotasi pegawai hanya dapat dilakukan pada periode yang belum dikunci.`
      }
    }

    // 2. Update snapshot for this period
    const { error: snapErr } = await adminClient
      .from('t_employee_period_snapshots')
      .update({
        unit_id: newUnitId,
        updated_at: new Date().toISOString()
      })
      .eq('period', period)
      .eq('employee_id', employeeId)

    if (snapErr) throw snapErr

    // 3. If this is the latest open period, sync to m_employees as current unit
    const { data: laterPeriods } = await adminClient
      .from('t_employee_periods')
      .select('period')
      .gt('period', period)
      .limit(1)

    if (!laterPeriods || laterPeriods.length === 0) {
      await adminClient
        .from('m_employees')
        .update({
          unit_id: newUnitId,
          updated_at: new Date().toISOString()
        })
        .eq('id', employeeId)
    }

    return { success: true }
  } catch (err: any) {
    console.error('rotateEmployeeUnit error:', err)
    return { success: false, error: err.message || 'Gagal memindahkan pegawai' }
  }
}

