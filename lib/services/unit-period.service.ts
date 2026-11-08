'use server'

import { createAdminClient } from '@/lib/supabase/server'
import type { UnitPeriod, UnitPeriodSnapshot } from '@/lib/types/database.types'
import { formatPeriodToMonthName } from '@/lib/utils/format'

export interface UnitWithPeriodData {
  id: string
  code: string
  name: string
  proportion_percentage: number
  proportion_umum_percentage?: number | null
  use_same_proportion?: boolean
  remuneration_style?: string
  kpi_schema_mode?: string
  is_active: boolean
  employee_count: number
  employees?: { count: number }[]
}

/**
 * Ensure default period 2026-01 exists, is locked, and units are snapshotted
 */
export async function ensureDefaultUnitPeriodEstablished() {
  const adminClient = await createAdminClient()

  // 1. Ensure 2026-01 exists in t_unit_periods
  const { data: existingPeriod } = await adminClient
    .from('t_unit_periods')
    .select('*')
    .eq('period', '2026-01')
    .maybeSingle()

  if (!existingPeriod) {
    await adminClient
      .from('t_unit_periods')
      .insert([{
        period: '2026-01',
        period_name: 'Januari 2026',
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: 'Sistem Otomatis',
        notes: 'Periode awal Januari 2026 dikunci secara otomatis oleh sistem'
      }])
  }

  // 2. Ensure snapshot for 2026-01 exists in t_unit_period_snapshots
  const { count } = await adminClient
    .from('t_unit_period_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('period', '2026-01')

  if (!count || count === 0) {
    const { data: masterUnits } = await adminClient
      .from('m_units')
      .select('*')

    const validUnits = (masterUnits || []).filter(u => {
      const code = String(u.code || '').toUpperCase()
      const name = String(u.name || '').toUpperCase()
      return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
    })

    if (validUnits.length > 0) {
      const snapshots = validUnits.map(u => ({
        period: '2026-01',
        unit_id: u.id,
        code: u.code,
        name: u.name,
        proportion_percentage: Number(u.proportion_percentage || 0),
        proportion_umum_percentage: u.proportion_umum_percentage !== null && u.proportion_umum_percentage !== undefined
          ? Number(u.proportion_umum_percentage)
          : Number(u.proportion_percentage || 0),
        use_same_proportion: u.use_same_proportion !== false,
        remuneration_style: u.remuneration_style || 'score_based',
        kpi_schema_mode: u.kpi_schema_mode || 'different',
        is_active: u.is_active !== undefined ? u.is_active : true,
      }))

      for (let i = 0; i < snapshots.length; i += 100) {
        const batch = snapshots.slice(i, i + 100)
        await adminClient.from('t_unit_period_snapshots').upsert(batch, { onConflict: 'period,unit_id' })
      }
    }
  }

  // 3. Sync any existing periods from t_employee_periods into t_unit_periods
  const { data: empPeriods } = await adminClient
    .from('t_employee_periods')
    .select('*')

  if (empPeriods && empPeriods.length > 0) {
    for (const ep of empPeriods) {
      if (ep.period === '2026-01') continue

      const { data: existU } = await adminClient
        .from('t_unit_periods')
        .select('id')
        .eq('period', ep.period)
        .maybeSingle()

      if (!existU) {
        await adminClient
          .from('t_unit_periods')
          .insert([{
            period: ep.period,
            period_name: ep.period_name || formatPeriodToMonthName(ep.period),
            is_locked: ep.is_locked,
            locked_at: ep.locked_at,
            locked_by: ep.locked_by,
            notes: ep.notes
          }])
      }

      // Ensure snapshot exists for this period
      const { count: uSnapCount } = await adminClient
        .from('t_unit_period_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('period', ep.period)

      if (!uSnapCount || uSnapCount === 0) {
        // Copy from 2026-01 or m_units
        const { data: baseSnapshots } = await adminClient
          .from('t_unit_period_snapshots')
          .select('*')
          .eq('period', '2026-01')

        if (baseSnapshots && baseSnapshots.length > 0) {
          const copies = baseSnapshots.map(s => ({
            period: ep.period,
            unit_id: s.unit_id,
            code: s.code,
            name: s.name,
            proportion_percentage: s.proportion_percentage,
            proportion_umum_percentage: s.proportion_umum_percentage,
            use_same_proportion: s.use_same_proportion,
            remuneration_style: s.remuneration_style,
            kpi_schema_mode: s.kpi_schema_mode,
            is_active: s.is_active
          }))
          for (let i = 0; i < copies.length; i += 100) {
            const batch = copies.slice(i, i + 100)
            await adminClient.from('t_unit_period_snapshots').upsert(batch, { onConflict: 'period,unit_id' })
          }
        }
      }
    }
  }
}

/**
 * Fetch list of all unit periods
 */
export async function getUnitPeriods(): Promise<{ data: UnitPeriod[]; error?: string }> {
  try {
    await ensureDefaultUnitPeriodEstablished()
    const adminClient = await createAdminClient()
    const { data, error } = await adminClient
      .from('t_unit_periods')
      .select('*')
      .order('period', { ascending: false })

    if (error) {
      console.error('Error fetching unit periods:', error)
      return { data: [], error: error.message }
    }

    return { data: data || [] }
  } catch (err: any) {
    console.error('Exception in getUnitPeriods:', err)
    return { data: [], error: err.message || 'Terjadi kesalahan' }
  }
}

/**
 * Get units with counts and proportions for a specific period
 */
export async function getUnitsByPeriod(period: string): Promise<{
  data: UnitWithPeriodData[]
  periodInfo: {
    period: string
    is_locked: boolean
    period_name: string
    locked_at?: string | null
    locked_by?: string | null
  }
  error?: string
}> {
  try {
    await ensureDefaultUnitPeriodEstablished()
    const adminClient = await createAdminClient()

    // 1. Get period lock info
    let { data: periodRow } = await adminClient
      .from('t_unit_periods')
      .select('*')
      .eq('period', period)
      .maybeSingle()

    if (!periodRow) {
      // Check employee periods
      const { data: epRow } = await adminClient
        .from('t_employee_periods')
        .select('*')
        .eq('period', period)
        .maybeSingle()

      const periodName = epRow?.period_name || formatPeriodToMonthName(period)
      const { data: newPRow } = await adminClient
        .from('t_unit_periods')
        .insert([{
          period,
          period_name: periodName,
          is_locked: epRow?.is_locked || false,
          locked_at: epRow?.locked_at || null,
          locked_by: epRow?.locked_by || null
        }])
        .select()
        .single()

      periodRow = newPRow || {
        period,
        period_name: periodName,
        is_locked: false,
        locked_at: null,
        locked_by: null
      }
    }

    const periodInfo = {
      period: periodRow.period,
      is_locked: Boolean(periodRow.is_locked),
      period_name: periodRow.period_name || formatPeriodToMonthName(period),
      locked_at: periodRow.locked_at,
      locked_by: periodRow.locked_by
    }

    // 2. Fetch unit proportion snapshots for this period
    const { data: snapshots } = await adminClient
      .from('t_unit_period_snapshots')
      .select('*')
      .eq('period', period)
      .order('code', { ascending: true })

    let unitsList: any[] = []

    if (snapshots && snapshots.length > 0) {
      unitsList = snapshots.map(s => ({
        id: s.unit_id,
        code: s.code,
        name: s.name,
        proportion_percentage: Number(s.proportion_percentage || 0),
        proportion_umum_percentage: s.proportion_umum_percentage !== null ? Number(s.proportion_umum_percentage) : Number(s.proportion_percentage || 0),
        use_same_proportion: s.use_same_proportion !== false,
        remuneration_style: s.remuneration_style,
        kpi_schema_mode: s.kpi_schema_mode,
        is_active: s.is_active
      }))
    } else {
      // Fallback: master units
      const { data: masterUnits } = await adminClient
        .from('m_units')
        .select('*')
        .order('code', { ascending: true })

      unitsList = (masterUnits || []).map(u => ({
        id: u.id,
        code: u.code,
        name: u.name,
        proportion_percentage: Number(u.proportion_percentage || 0),
        proportion_umum_percentage: u.proportion_umum_percentage !== null ? Number(u.proportion_umum_percentage) : Number(u.proportion_percentage || 0),
        use_same_proportion: u.use_same_proportion !== false,
        remuneration_style: u.remuneration_style,
        kpi_schema_mode: u.kpi_schema_mode,
        is_active: u.is_active
      }))
    }

    // Filter out superadmin / admin units
    const filteredUnits = unitsList.filter(u => {
      const code = String(u.code || '').toUpperCase()
      const name = String(u.name || '').toUpperCase()
      return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
    })

    // 3. Get employee count per unit for this period
    // Use t_employee_period_snapshots for this period if available, otherwise m_employees
    const { count: empSnapCount } = await adminClient
      .from('t_employee_period_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('period', period)

    const empCountByUnit = new Map<string, number>()

    if (empSnapCount && empSnapCount > 0) {
      const { data: empSnaps } = await adminClient
        .from('t_employee_period_snapshots')
        .select('unit_id')
        .eq('period', period)
        .eq('is_active', true)
        .neq('role', 'superadmin')

      if (empSnaps) {
        empSnaps.forEach(e => {
          if (e.unit_id) {
            empCountByUnit.set(e.unit_id, (empCountByUnit.get(e.unit_id) || 0) + 1)
          }
        })
      }
    } else {
      const { data: masterEmps } = await adminClient
        .from('m_employees')
        .select('unit_id')
        .eq('is_active', true)
        .neq('role', 'superadmin')

      if (masterEmps) {
        masterEmps.forEach(e => {
          if (e.unit_id) {
            empCountByUnit.set(e.unit_id, (empCountByUnit.get(e.unit_id) || 0) + 1)
          }
        })
      }
    }

    const result: UnitWithPeriodData[] = filteredUnits.map(unit => {
      const count = empCountByUnit.get(unit.id) || 0
      return {
        ...unit,
        employee_count: count,
        employees: [{ count }]
      }
    })

    return {
      data: result,
      periodInfo
    }
  } catch (err: any) {
    console.error('getUnitsByPeriod error:', err)
    return {
      data: [],
      periodInfo: {
        period,
        is_locked: false,
        period_name: formatPeriodToMonthName(period)
      },
      error: err.message || 'Gagal memuat data unit periode'
    }
  }
}

/**
 * Lock unit period proportions
 */
export async function lockUnitPeriod(period: string, lockedBy: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()

    // 1. Ensure snapshots exist for this period before locking
    const { count } = await adminClient
      .from('t_unit_period_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('period', period)

    if (!count || count === 0) {
      // Find latest previous period snapshots or master m_units
      const { data: prevPeriods } = await adminClient
        .from('t_unit_periods')
        .select('period')
        .lt('period', period)
        .order('period', { ascending: false })
        .limit(1)

      const prevPeriod = prevPeriods?.[0]?.period
      let unitsToSnapshot: any[] = []

      if (prevPeriod) {
        const { data: prevSnapshots } = await adminClient
          .from('t_unit_period_snapshots')
          .select('*')
          .eq('period', prevPeriod)
        if (prevSnapshots && prevSnapshots.length > 0) {
          unitsToSnapshot = prevSnapshots.map(s => ({
            ...s,
            id: undefined,
            period,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }))
        }
      }

      if (unitsToSnapshot.length === 0) {
        const { data: masterUnits } = await adminClient
          .from('m_units')
          .select('*')
        unitsToSnapshot = (masterUnits || [])
          .filter(u => {
            const code = String(u.code || '').toUpperCase()
            return code !== 'ADMIN' && code !== 'SUPERADMIN'
          })
          .map(u => ({
            period,
            unit_id: u.id,
            code: u.code,
            name: u.name,
            proportion_percentage: Number(u.proportion_percentage || 0),
            proportion_umum_percentage: u.proportion_umum_percentage !== null ? Number(u.proportion_umum_percentage) : Number(u.proportion_percentage || 0),
            use_same_proportion: u.use_same_proportion !== false,
            remuneration_style: u.remuneration_style || 'score_based',
            kpi_schema_mode: u.kpi_schema_mode || 'different',
            is_active: u.is_active !== undefined ? u.is_active : true
          }))
      }

      for (let i = 0; i < unitsToSnapshot.length; i += 100) {
        const batch = unitsToSnapshot.slice(i, i + 100)
        await adminClient.from('t_unit_period_snapshots').upsert(batch, { onConflict: 'period,unit_id' })
      }
    }

    // 2. Mark period as locked in t_unit_periods
    const { error: lockErr } = await adminClient
      .from('t_unit_periods')
      .upsert({
        period,
        period_name: formatPeriodToMonthName(period),
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: lockedBy || 'Admin',
        updated_at: new Date().toISOString()
      }, { onConflict: 'period' })

    if (lockErr) throw lockErr

    return { success: true }
  } catch (err: any) {
    console.error('lockUnitPeriod error:', err)
    return { success: false, error: err.message || 'Gagal mengunci periode unit' }
  }
}

/**
 * Unlock unit period
 */
export async function unlockUnitPeriod(period: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()

    const { error } = await adminClient
      .from('t_unit_periods')
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
    console.error('unlockUnitPeriod error:', err)
    return { success: false, error: err.message || 'Gagal membuka kunci periode unit' }
  }
}

/**
 * Create next unit period (e.g., February 2026), copying proportions from sourcePeriod
 */
export async function createNextUnitPeriod(
  newPeriod: string,
  sourcePeriod?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()
    const periodName = formatPeriodToMonthName(newPeriod)

    // 1. Ensure newPeriod exists in t_unit_periods
    const { data: existing } = await adminClient
      .from('t_unit_periods')
      .select('*')
      .eq('period', newPeriod)
      .maybeSingle()

    if (!existing) {
      const { error: inErr } = await adminClient
        .from('t_unit_periods')
        .insert([{
          period: newPeriod,
          period_name: periodName,
          is_locked: false,
          notes: `Dibuka berdasarkan ${sourcePeriod || 'periode sebelumnya'}`
        }])
      if (inErr) throw inErr
    }

    // Also ensure it exists in t_employee_periods so both modules share the period
    const { data: existingEmpPeriod } = await adminClient
      .from('t_employee_periods')
      .select('id')
      .eq('period', newPeriod)
      .maybeSingle()

    if (!existingEmpPeriod) {
      await adminClient
        .from('t_employee_periods')
        .insert([{
          period: newPeriod,
          period_name: periodName,
          is_locked: false,
          notes: `Dibuka berdasarkan ${sourcePeriod || 'periode sebelumnya'}`
        }])
    }

    // 2. Snapshot proportions for newPeriod
    const { count } = await adminClient
      .from('t_unit_period_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('period', newPeriod)

    if (!count || count === 0) {
      let sourceToUse = sourcePeriod
      if (!sourceToUse) {
        const { data: latestPeriods } = await adminClient
          .from('t_unit_periods')
          .select('period')
          .lt('period', newPeriod)
          .order('period', { ascending: false })
          .limit(1)
        sourceToUse = latestPeriods?.[0]?.period || '2026-01'
      }

      let candidates: any[] = []
      if (sourceToUse) {
        const { data: sourceSnapshots } = await adminClient
          .from('t_unit_period_snapshots')
          .select('*')
          .eq('period', sourceToUse)

        if (sourceSnapshots && sourceSnapshots.length > 0) {
          candidates = sourceSnapshots.map(s => ({
            period: newPeriod,
            unit_id: s.unit_id,
            code: s.code,
            name: s.name,
            proportion_percentage: s.proportion_percentage,
            proportion_umum_percentage: s.proportion_umum_percentage,
            use_same_proportion: s.use_same_proportion,
            remuneration_style: s.remuneration_style,
            kpi_schema_mode: s.kpi_schema_mode,
            is_active: s.is_active
          }))
        }
      }

      if (candidates.length === 0) {
        const { data: masterUnits } = await adminClient
          .from('m_units')
          .select('*')
        candidates = (masterUnits || [])
          .filter(u => {
            const code = String(u.code || '').toUpperCase()
            return code !== 'ADMIN' && code !== 'SUPERADMIN'
          })
          .map(u => ({
            period: newPeriod,
            unit_id: u.id,
            code: u.code,
            name: u.name,
            proportion_percentage: Number(u.proportion_percentage || 0),
            proportion_umum_percentage: u.proportion_umum_percentage !== null ? Number(u.proportion_umum_percentage) : Number(u.proportion_percentage || 0),
            use_same_proportion: u.use_same_proportion !== false,
            remuneration_style: u.remuneration_style || 'score_based',
            kpi_schema_mode: u.kpi_schema_mode || 'different',
            is_active: u.is_active !== undefined ? u.is_active : true
          }))
      }

      for (let i = 0; i < candidates.length; i += 100) {
        const batch = candidates.slice(i, i + 100)
        await adminClient.from('t_unit_period_snapshots').upsert(batch, { onConflict: 'period,unit_id' })
      }
    }

    return { success: true }
  } catch (err: any) {
    console.error('createNextUnitPeriod error:', err)
    return { success: false, error: err.message || 'Gagal membuat periode unit baru' }
  }
}

/**
 * Update unit proportion for a specific period
 */
export async function updateUnitProportionInPeriod(
  period: string,
  unitId: string,
  data: {
    proportion_percentage: number
    proportion_umum_percentage?: number | null
    use_same_proportion?: boolean
    is_active?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient()

    // 1. Verify period is NOT locked
    const { data: periodRow } = await adminClient
      .from('t_unit_periods')
      .select('is_locked, period_name')
      .eq('period', period)
      .maybeSingle()

    if (periodRow?.is_locked) {
      return {
        success: false,
        error: `Periode ${periodRow.period_name || period} telah dikunci. Proporsi unit pada periode ini tidak dapat diubah.`
      }
    }

    // 2. Fetch unit details from m_units or snapshot
    const { data: unitMaster } = await adminClient
      .from('m_units')
      .select('*')
      .eq('id', unitId)
      .single()

    if (!unitMaster) {
      return { success: false, error: 'Unit kerja tidak ditemukan' }
    }

    const proportionBPJS = Number(data.proportion_percentage)
    const useSame = data.use_same_proportion !== false
    const proportionUMUM = useSame
      ? proportionBPJS
      : Number(data.proportion_umum_percentage ?? proportionBPJS)

    // 3. Upsert into t_unit_period_snapshots
    const snapshotData = {
      period,
      unit_id: unitId,
      code: unitMaster.code,
      name: unitMaster.name,
      proportion_percentage: proportionBPJS,
      proportion_umum_percentage: proportionUMUM,
      use_same_proportion: useSame,
      remuneration_style: unitMaster.remuneration_style || 'score_based',
      kpi_schema_mode: unitMaster.kpi_schema_mode || 'different',
      is_active: data.is_active !== undefined ? data.is_active : unitMaster.is_active,
      updated_at: new Date().toISOString()
    }

    const { error: upErr } = await adminClient
      .from('t_unit_period_snapshots')
      .upsert(snapshotData, { onConflict: 'period,unit_id' })

    if (upErr) throw upErr

    // 4. If this is the latest open period, sync to m_units default
    const { data: laterPeriods } = await adminClient
      .from('t_unit_periods')
      .select('period')
      .gt('period', period)
      .limit(1)

    if (!laterPeriods || laterPeriods.length === 0) {
      await adminClient
        .from('m_units')
        .update({
          proportion_percentage: proportionBPJS,
          proportion_umum_percentage: proportionUMUM,
          use_same_proportion: useSame,
          is_active: data.is_active !== undefined ? data.is_active : unitMaster.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', unitId)
    }

    return { success: true }
  } catch (err: any) {
    console.error('updateUnitProportionInPeriod error:', err)
    return { success: false, error: err.message || 'Gagal memperbarui proporsi unit' }
  }
}

/**
 * Helper to fetch map of unit proportions for a period
 * Key: unit_id, Value: { proportion_percentage, proportion_umum_percentage, use_same_proportion }
 */
export async function getPeriodUnitProportionsMap(supabaseClient: any, period: string) {
  const map = new Map<string, {
    proportion_percentage: number
    proportion_umum_percentage: number
    use_same_proportion: boolean
  }>()

  // 1. Fetch from snapshots for this period
  const { data: snapshots } = await supabaseClient
    .from('t_unit_period_snapshots')
    .select('unit_id, proportion_percentage, proportion_umum_percentage, use_same_proportion')
    .eq('period', period)

  if (snapshots && snapshots.length > 0) {
    snapshots.forEach((s: any) => {
      const bpjs = Number(s.proportion_percentage || 0)
      const useSame = s.use_same_proportion !== false
      const umum = useSame
        ? bpjs
        : (s.proportion_umum_percentage !== null && s.proportion_umum_percentage !== undefined ? Number(s.proportion_umum_percentage) : bpjs)

      map.set(s.unit_id, {
        proportion_percentage: bpjs,
        proportion_umum_percentage: umum,
        use_same_proportion: useSame
      })
    })
  }

  return map
}

