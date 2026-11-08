import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const userClient = await createClient()
    const supabaseAdmin = await createAdminClient()

    // Check authentication and role
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin
      .from('m_employees')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const role = profile?.role || user.user_metadata?.role
    if (role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const period = formData.get('period') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Check if period is locked
    if (period) {
      const { data: periodRow } = await supabaseAdmin
        .from('t_unit_periods')
        .select('is_locked, period_name')
        .eq('period', period)
        .maybeSingle()

      if (periodRow?.is_locked) {
        return NextResponse.json(
          { error: `Periode ${periodRow.period_name || period} telah dikunci. Import porsi unit tidak diperbolehkan pada periode terkunci.` },
          { status: 400 }
        )
      }
    }

    // Read Excel file robustly
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!worksheet) {
      return NextResponse.json({ error: 'Sheet empty or invalid' }, { status: 400 })
    }

    const rawData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[]
    console.log(`[IMPORT] Received ${rawData.length} rows from Excel for period: ${period || 'master'}`)

    // Flexible Header Mapping
    const getVal = (row: Record<string, any>, possibleKeys: string[]) => {
      for (const key of possibleKeys) {
        if (row[key] !== undefined) return row[key]
        const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.toLowerCase())
        if (foundKey) return row[foundKey]
      }
      return undefined
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    }

    // Check if we should sync to master m_units
    let shouldSyncMaster = true
    if (period) {
      const { data: laterPeriods } = await supabaseAdmin
        .from('t_unit_periods')
        .select('period')
        .gt('period', period)
        .limit(1)

      if (laterPeriods && laterPeriods.length > 0) {
        shouldSyncMaster = false
      }
    }

    // Process each row
    for (const row of rawData) {
      const code = getVal(row, ['Kode Unit', 'Kode', 'Code'])?.toString()
      const name = getVal(row, ['Nama Unit', 'Unit', 'Name'])?.toString()

      if (!code || !name) {
        if (Object.keys(row).length > 0) {
          results.failed++
          results.errors.push(`Baris lewati: Data tidak lengkap (Kode/Nama missing)`)
        }
        continue
      }

      try {
        const rawProportion = getVal(row, ['Proporsi (%)', 'Proporsi', 'Proportion', 'Percentage'])
        const proportion = parseFloat(rawProportion?.toString() || '0')
        const statusStr = getVal(row, ['Status', 'Active'])?.toString().toLowerCase()

        // Validate proportion
        const validProportion = isNaN(proportion) ? 0 : Math.min(100, Math.max(0, proportion))

        // Check if unit exists by code
        const { data: existing, error: checkError } = await supabaseAdmin
          .from('m_units')
          .select('*')
          .eq('code', code)
          .maybeSingle()

        if (checkError) throw checkError

        let unitId = existing?.id

        if (existing) {
          if (shouldSyncMaster) {
            const { error: updateError } = await supabaseAdmin
              .from('m_units')
              .update({
                name,
                proportion_percentage: validProportion,
                is_active: statusStr ? (statusStr === 'aktif' || statusStr === 'active' || statusStr === '1' || statusStr === 'true') : existing.is_active,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id)
            if (updateError) throw updateError
          }
        } else {
          const { data: inserted, error: insertError } = await supabaseAdmin
            .from('m_units')
            .insert({
              code,
              name,
              proportion_percentage: validProportion,
              proportion_umum_percentage: validProportion,
              use_same_proportion: true,
              is_active: statusStr ? (statusStr === 'aktif' || statusStr === 'active' || statusStr === '1' || statusStr === 'true') : true,
              created_at: new Date().toISOString()
            })
            .select()
            .single()
          if (insertError) throw insertError
          unitId = inserted?.id
        }

        // If period is specified, upsert into period snapshot
        if (period && unitId) {
          const { error: snapError } = await supabaseAdmin
            .from('t_unit_period_snapshots')
            .upsert({
              period,
              unit_id: unitId,
              code,
              name,
              proportion_percentage: validProportion,
              proportion_umum_percentage: validProportion,
              use_same_proportion: true,
              is_active: statusStr ? (statusStr === 'aktif' || statusStr === 'active' || statusStr === '1' || statusStr === 'true') : true,
              updated_at: new Date().toISOString()
            }, { onConflict: 'period,unit_id' })

          if (snapError) throw snapError
        }

        results.success++
      } catch (error: any) {
        console.error(`[IMPORT ERROR] Unit ${code}:`, error)
        results.failed++
        results.errors.push(`Baris "${code}": ${error.message || 'Error tidak diketahui'}`)
      }
    }

    console.log(`[IMPORT COMPLETED] Success: ${results.success}, Failed: ${results.failed}`)
    return NextResponse.json(results)
  } catch (error: any) {
    console.error('CRITICAL: Error importing units:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import units' },
      { status: 500 }
    )
  }
}
