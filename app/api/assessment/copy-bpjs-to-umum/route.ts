import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export const dynamic = 'force-dynamic'

/**
 * Normalizes string for fuzzy/robust matching (lowercases, removes punctuation/whitespace)
 */
function normalizeKey(str?: string | null): string {
  if (!str) return ''
  return str.toLowerCase().replace(/[\s\-_.:;/\\]+/g, '').trim()
}

/**
 * Helper to fetch all rows paginated in chunks of 1000
 */
async function fetchAllRows(adminClient: any, table: string, selectCols: string, filterFn: (query: any) => any) {
  let allRows: any[] = []
  let from = 0
  const limit = 1000
  let hasMore = true

  while (hasMore) {
    let query = adminClient.from(table).select(selectCols).range(from, from + limit - 1)
    query = filterFn(query)
    const { data, error } = await query
    if (error) {
      console.error(`Error fetching all rows from ${table}:`, error)
      break
    }
    if (data && data.length > 0) {
      allRows.push(...data)
      from += limit
      if (data.length < limit) {
        hasMore = false
      }
    } else {
      hasMore = false
    }
  }

  return allRows
}

/**
 * POST /api/assessment/copy-bpjs-to-umum
 * 
 * Copies KPI assessments from BPJS to Pendapatan UMUM for all employees in a unit.
 * EXCLUDES priority indicators (calculation_method === 'priority').
 * 
 * Supports both 'same' and 'different' kpi_schema_mode:
 * - 'same': uses the same indicator_id, just sets revenue_type to 'umum'
 * - 'different': maps BPJS indicator_ids to UMUM indicator_ids by matching category and code/name
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = await createAdminClient()

    // Find current employee
    let currentEmployee: any = null
    const { data: byUserId } = await adminClient
      .from('m_employees')
      .select('id, role, unit_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (byUserId) {
      currentEmployee = byUserId
    } else {
      const authRole = user.app_metadata?.role || user.user_metadata?.role
      const isSuperAdmin = authRole === 'superadmin' || authRole === 'admin' || user.email === 'admin@sungaipenuh.com'
      if (isSuperAdmin) {
        const { data: adminEmp } = await adminClient
          .from('m_employees')
          .select('id, role, unit_id')
          .or('role.eq.superadmin,role.eq.admin')
          .limit(1)
          .maybeSingle()
        currentEmployee = { id: adminEmp?.id || user.id, role: 'superadmin', unit_id: '0' }
      }
    }

    if (!currentEmployee) {
      return NextResponse.json({ error: 'Pegawai tidak ditemukan' }, { status: 404 })
    }

    // Superadmin override
    const authRole = user.app_metadata?.role || user.user_metadata?.role
    if (authRole === 'superadmin' || authRole === 'admin' || user.email === 'admin@sungaipenuh.com' || currentEmployee.role === 'superadmin' || currentEmployee.role === 'admin') {
      currentEmployee.role = 'superadmin'
    }

    const { unit_id, period } = await request.json()

    if (!unit_id || !period) {
      return NextResponse.json({ error: 'unit_id dan period harus diisi' }, { status: 400 })
    }

    // Authorization check
    if (currentEmployee.role === 'unit_manager' && currentEmployee.unit_id !== unit_id) {
      return NextResponse.json({ error: 'Anda hanya dapat menyalin penilaian untuk unit Anda sendiri' }, { status: 403 })
    }

    if (currentEmployee.role !== 'superadmin' && currentEmployee.role !== 'unit_manager') {
      return NextResponse.json({ error: 'Hak akses tidak memadai' }, { status: 403 })
    }

    // Check period approval status
    const { data: remCheck } = await adminClient
      .from('remunerasi_periode')
      .select('status')
      .eq('periode', period)
      .maybeSingle()

    if (remCheck?.status === 'approved') {
      return NextResponse.json({
        error: `Periode ${period} telah disetujui dan terkunci. Penilaian tidak dapat diubah.`
      }, { status: 403 })
    }

    // 1. Get unit info
    const { data: unitData } = await adminClient
      .from('m_units')
      .select('id, name, kpi_schema_mode')
      .eq('id', unit_id)
      .single()

    if (!unitData) {
      return NextResponse.json({ error: 'Unit tidak ditemukan' }, { status: 404 })
    }

    const schemaMode = unitData.kpi_schema_mode || 'same'

    // 2. Get active employees in this unit
    const { data: employees } = await adminClient
      .from('m_employees')
      .select('id, full_name')
      .eq('unit_id', unit_id)
      .eq('is_active', true)
      .neq('role', 'superadmin')

    if (!employees || employees.length === 0) {
      return NextResponse.json({ error: 'Tidak ada pegawai aktif di unit ini.' }, { status: 400 })
    }

    const employeeIds = employees.map(e => e.id)

    // 3. Get BPJS KPI categories for this unit
    const { data: bpjsCategories } = await adminClient
      .from('m_kpi_categories')
      .select('id, category, category_name, configuration_style')
      .eq('unit_id', unit_id)
      .eq('is_active', true)
      .or('revenue_type.eq.bpjs,revenue_type.is.null')

    if (!bpjsCategories || bpjsCategories.length === 0) {
      return NextResponse.json({ error: 'Tidak ada kategori KPI BPJS untuk unit ini' }, { status: 404 })
    }

    const bpjsCategoryIds = bpjsCategories.map(c => c.id)

    // 4. Get BPJS indicators
    const { data: bpjsIndicators } = await adminClient
      .from('m_kpi_indicators')
      .select('id, code, name, category_id, calculation_method, target_value, weight_percentage')
      .eq('is_active', true)
      .in('category_id', bpjsCategoryIds)

    if (!bpjsIndicators || bpjsIndicators.length === 0) {
      return NextResponse.json({ error: 'Tidak ada indikator KPI BPJS untuk unit ini' }, { status: 404 })
    }

    // Filter out priority indicators (calculation_method === 'priority')
    const indexingIndicators = bpjsIndicators.filter(ind => {
      return ind.calculation_method !== 'priority'
    })

    const priorityExcludedCount = bpjsIndicators.length - indexingIndicators.length

    if (indexingIndicators.length === 0) {
      return NextResponse.json({
        error: 'Semua indikator KPI BPJS pada unit ini adalah tipe prioritas. Tidak ada indikator kinerja non-prioritas yang dapat disalin ke UMUM.'
      }, { status: 400 })
    }

    const bpjsIndicatorIds = indexingIndicators.map(ind => ind.id)

    // 5. Build indicator mapping from BPJS to UMUM
    const indicatorMapping = new Map<string, { id: string; target_value: number; weight_percentage: number }>()
    const subIndicatorMapping = new Map<string, string>()

    if (schemaMode === 'different') {
      // Fetch UMUM categories for this unit
      const { data: umumCategories } = await adminClient
        .from('m_kpi_categories')
        .select('id, category, category_name')
        .eq('unit_id', unit_id)
        .eq('is_active', true)
        .eq('revenue_type', 'umum')

      if (!umumCategories || umumCategories.length === 0) {
        return NextResponse.json({
          error: 'Tidak ditemukan konfigurasi kategori KPI UMUM untuk unit ini. Harap konfigurasikan KPI Pendapatan UMUM terlebih dahulu di menu KPI Config.'
        }, { status: 400 })
      }

      const umumCategoryIds = umumCategories.map(c => c.id)

      // Fetch UMUM indicators
      const { data: umumIndicators } = await adminClient
        .from('m_kpi_indicators')
        .select('id, code, name, category_id, calculation_method, target_value, weight_percentage')
        .eq('is_active', true)
        .in('category_id', umumCategoryIds)

      if (!umumIndicators || umumIndicators.length === 0) {
        return NextResponse.json({
          error: 'Tidak ditemukan indikator KPI UMUM untuk unit ini. Konfigurasikan indikator UMUM terlebih dahulu.'
        }, { status: 400 })
      }

      // Map BPJS categories to category code (e.g. 'P1', 'P2', 'P3')
      const bpjsCatMap = new Map(bpjsCategories.map(c => [c.id, c.category]))
      const umumCatMap = new Map(umumCategories.map(c => [c.id, c.category]))

      for (const bInd of indexingIndicators) {
        const bCatType = bpjsCatMap.get(bInd.category_id)
        const bNormCode = normalizeKey(bInd.code)
        const bNormName = normalizeKey(bInd.name)

        // Find matching UMUM indicator in same category (P1/P2/P3), matching name first, then code
        let uInd = umumIndicators.find(u => {
          const uCatType = umumCatMap.get(u.category_id)
          if (uCatType !== bCatType) return false
          const uNormName = normalizeKey(u.name)
          return uNormName && uNormName === bNormName
        })

        if (!uInd) {
          uInd = umumIndicators.find(u => {
            const uCatType = umumCatMap.get(u.category_id)
            if (uCatType !== bCatType) return false
            const uNormCode = normalizeKey(u.code)
            return uNormCode && uNormCode === bNormCode
          })
        }

        if (uInd) {
          indicatorMapping.set(bInd.id, {
            id: uInd.id,
            target_value: uInd.target_value ?? bInd.target_value ?? 0,
            weight_percentage: uInd.weight_percentage ?? bInd.weight_percentage ?? 0
          })
        }
      }

      // Map sub-indicators
      const bpjsMappedIndIds = Array.from(indicatorMapping.keys())
      const umumMappedIndIds = Array.from(indicatorMapping.values()).map(v => v.id)

      if (bpjsMappedIndIds.length > 0 && umumMappedIndIds.length > 0) {
        const [bpjsSubsRes, umumSubsRes] = await Promise.all([
          adminClient.from('m_kpi_sub_indicators').select('id, code, name, indicator_id').in('indicator_id', bpjsMappedIndIds),
          adminClient.from('m_kpi_sub_indicators').select('id, code, name, indicator_id').in('indicator_id', umumMappedIndIds)
        ])

        const bpjsSubs = bpjsSubsRes.data || []
        const umumSubs = umumSubsRes.data || []

        for (const bSub of bpjsSubs) {
          const uIndInfo = indicatorMapping.get(bSub.indicator_id)
          if (!uIndInfo) continue

          const bSubCode = normalizeKey(bSub.code)
          const bSubName = normalizeKey(bSub.name)

          // Match sub-indicator by name first, then code
          let uSub = umumSubs.find((s: any) => {
            if (s.indicator_id !== uIndInfo.id) return false
            const sName = normalizeKey(s.name)
            return sName && sName === bSubName
          })

          if (!uSub) {
            uSub = umumSubs.find((s: any) => {
              if (s.indicator_id !== uIndInfo.id) return false
              const sCode = normalizeKey(s.code)
              return sCode && sCode === bSubCode
            })
          }

          if (uSub) {
            subIndicatorMapping.set(bSub.id, uSub.id)
          }
        }
      }

      if (indicatorMapping.size === 0) {
        return NextResponse.json({
          error: 'Tidak dapat menemukan padanan indikator KPI antara BPJS dan UMUM. Pastikan kode atau nama indikator pada KPI BPJS dan UMUM sesuai.'
        }, { status: 400 })
      }
    } else {
      // 'same' schema mode: same indicator IDs
      for (const ind of indexingIndicators) {
        indicatorMapping.set(ind.id, {
          id: ind.id,
          target_value: ind.target_value ?? 0,
          weight_percentage: ind.weight_percentage ?? 0
        })
      }
    }

    // For 'different' schema mode, clean up obsolete rows that were mistakenly saved with BPJS indicator IDs under revenue_type = 'umum'
    if (schemaMode === 'different' && bpjsIndicatorIds.length > 0) {
      await adminClient
        .from('t_kpi_assessments')
        .delete()
        .in('employee_id', employeeIds)
        .eq('period', period)
        .eq('revenue_type', 'umum')
        .in('indicator_id', bpjsIndicatorIds)
    }

    // 6. Fetch BPJS assessments for these employees and period (non-priority indicators)
    const allBpjsAssessments = await fetchAllRows(
      adminClient,
      't_kpi_assessments',
      '*',
      (q: any) => q
        .in('employee_id', employeeIds)
        .eq('period', period)
        .or('revenue_type.eq.bpjs,revenue_type.is.null')
        .in('indicator_id', bpjsIndicatorIds)
    )

    if (allBpjsAssessments.length === 0) {
      return NextResponse.json({
        error: `Tidak ditemukan data penilaian KPI BPJS (non-prioritas) untuk periode ${period} di unit ${unitData.name}. Harap isi penilaian BPJS terlebih dahulu sebelum menyalin ke UMUM.`
      }, { status: 404 })
    }

    // 7. Pre-fetch existing UMUM assessment rows for these employees to prevent duplicates
    const existingUmumRows = await fetchAllRows(
      adminClient,
      't_kpi_assessments',
      'id, employee_id, indicator_id, sub_indicator_id',
      (q: any) => q
        .in('employee_id', employeeIds)
        .eq('period', period)
        .eq('revenue_type', 'umum')
    )

    const existingUmumMap = new Map<string, string>()
    for (const row of existingUmumRows) {
      const key = `${row.employee_id}:${row.indicator_id}:${row.sub_indicator_id || 'main'}`
      existingUmumMap.set(key, row.id)
    }

    // Pre-fetch existing t_realization rows
    const existingRealRows = await fetchAllRows(
      adminClient,
      't_realization',
      'id, employee_id, indicator_id, sub_indicator_id',
      (q: any) => q
        .in('employee_id', employeeIds)
        .eq('period', period)
    )

    const existingRealMap = new Map<string, string>()
    for (const row of existingRealRows) {
      const key = `${row.employee_id}:${row.indicator_id}:${row.sub_indicator_id || 'main'}`
      existingRealMap.set(key, row.id)
    }

    // 8. Prepare UMUM assessment records and mirror records
    const recordsToInsertMap = new Map<string, any>()
    const recordsToUpdate: { id: string; data: any }[] = []
    const realToInsertMap = new Map<string, any>()
    const realToUpdate: { id: string; data: any }[] = []

    let skippedCount = 0
    const nowIso = new Date().toISOString()

    for (const bAss of allBpjsAssessments) {
      const uIndInfo = indicatorMapping.get(bAss.indicator_id)
      if (!uIndInfo) {
        skippedCount++
        continue
      }

      let uSubId: string | null = bAss.sub_indicator_id || null
      if (schemaMode === 'different' && bAss.sub_indicator_id) {
        const mappedSubId = subIndicatorMapping.get(bAss.sub_indicator_id)
        if (!mappedSubId) {
          skippedCount++
          continue
        }
        uSubId = mappedSubId
      }

      const key = `${bAss.employee_id}:${uIndInfo.id}:${uSubId || 'main'}`

      const umumRecord = {
        employee_id: bAss.employee_id,
        indicator_id: uIndInfo.id,
        sub_indicator_id: uSubId,
        period: period,
        realization_value: bAss.realization_value ?? 0,
        target_value: uIndInfo.target_value ?? bAss.target_value ?? 0,
        weight_percentage: uIndInfo.weight_percentage ?? bAss.weight_percentage ?? 0,
        score: bAss.score ?? 0,
        notes: bAss.notes || '',
        assessor_id: currentEmployee.id,
        revenue_type: 'umum',
        updated_at: nowIso
      }

      const existingId = existingUmumMap.get(key)
      if (existingId) {
        recordsToUpdate.push({ id: existingId, data: umumRecord })
      } else {
        recordsToInsertMap.set(key, { ...umumRecord, created_at: nowIso })
      }

      // Mirror to t_realization
      const realPayload = {
        employee_id: bAss.employee_id,
        indicator_id: uIndInfo.id,
        sub_indicator_id: uSubId,
        period: period,
        realization_value: bAss.realization_value ?? 0,
        score: bAss.score ?? 0,
        notes: bAss.notes || null,
        created_by: currentEmployee.id
      }

      const existingRealId = existingRealMap.get(key)
      if (existingRealId) {
        realToUpdate.push({ id: existingRealId, data: realPayload })
      } else {
        realToInsertMap.set(key, realPayload)
      }
    }

    const recordsToInsert = Array.from(recordsToInsertMap.values())
    const realToInsert = Array.from(realToInsertMap.values())

    if (recordsToInsert.length === 0 && recordsToUpdate.length === 0) {
      return NextResponse.json({
        error: 'Tidak ada data penilaian yang dapat disalin ke UMUM. Pastikan ada indikator BPJS non-prioritas yang memiliki padanan di UMUM.'
      }, { status: 400 })
    }

    // 9. Execute DB operations in batches
    let successCount = 0
    let errorCount = 0
    const chunkSize = 50

    // Inserts/Upserts into t_kpi_assessments
    for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
      const chunk = recordsToInsert.slice(i, i + chunkSize)
      const { error: insErr } = await adminClient
        .from('t_kpi_assessments')
        .upsert(chunk, { onConflict: 'employee_id,indicator_id,period,sub_indicator_id,revenue_type' })
      if (insErr) {
        console.error('Copy BPJS->UMUM insert error chunk', Math.floor(i / chunkSize), ':', insErr)
        errorCount += chunk.length
      } else {
        successCount += chunk.length
      }
    }

    // Updates into t_kpi_assessments
    for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
      const chunk = recordsToUpdate.slice(i, i + chunkSize)
      const results = await Promise.all(
        chunk.map(item => adminClient.from('t_kpi_assessments').update(item.data).eq('id', item.id))
      )
      for (const res of results) {
        if (res.error) {
          console.error('Copy BPJS->UMUM update error:', res.error)
          errorCount++
        } else {
          successCount++
        }
      }
    }

    // Mirror to t_realization (non-blocking)
    try {
      for (let i = 0; i < realToInsert.length; i += chunkSize) {
        const chunk = realToInsert.slice(i, i + chunkSize)
        await adminClient.from('t_realization').insert(chunk)
      }
      for (let i = 0; i < realToUpdate.length; i += chunkSize) {
        const chunk = realToUpdate.slice(i, i + chunkSize)
        await Promise.all(
          chunk.map(item => adminClient.from('t_realization').update(item.data).eq('id', item.id))
        )
      }
    } catch (realErr) {
      console.warn('Mirror to t_realization error during BPJS->UMUM copy:', realErr)
    }

    const uniqueEmployees = new Set(
      [...recordsToInsert, ...recordsToUpdate.map(u => u.data)].map(r => r.employee_id)
    ).size

    return NextResponse.json({
      success: true,
      message: `Berhasil menyalin ${successCount} penilaian KPI (non-prioritas) dari BPJS ke Pendapatan UMUM untuk ${uniqueEmployees} pegawai di unit ${unitData.name} periode ${period}.${priorityExcludedCount > 0 ? ` ${priorityExcludedCount} indikator prioritas dilewati sesuai ketentuan.` : ''}${errorCount > 0 ? ` (${errorCount} gagal).` : ''}${skippedCount > 0 ? ` (${skippedCount} sub/indikator dilewati tanpa padanan).` : ''}`,
      copied: successCount,
      inserted: recordsToInsert.length,
      updated: recordsToUpdate.length,
      errors: errorCount,
      skipped: skippedCount,
      priority_excluded: priorityExcludedCount,
      employees_affected: uniqueEmployees
    })

  } catch (error: any) {
    console.error('Copy BPJS to UMUM uncaught error:', error)
    return NextResponse.json({
      error: 'Terjadi kesalahan sistem saat menyalin penilaian BPJS ke UMUM: ' + (error.message || 'Unknown error')
    }, { status: 500 })
  }
}
