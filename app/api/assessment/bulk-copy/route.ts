import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

/**
 * Paginated fetch to bypass Supabase's default 1000-row limit.
 */
async function fetchAllRows(
    client: any,
    table: string,
    selectFields: string,
    filters: (q: any) => any,
    pageSize: number = 1000
): Promise<any[]> {
    const allRows: any[] = []
    let page = 0
    while (true) {
        const from = page * pageSize
        const to = from + pageSize - 1
        let query = client.from(table).select(selectFields).range(from, to)
        query = filters(query)
        const { data, error } = await query
        if (error) {
            console.error(`[fetchAllRows] Error fetching ${table} page ${page}:`, error)
            break
        }
        if (data && data.length > 0) {
            allRows.push(...data)
            if (data.length < pageSize) break
            page++
        } else {
            break
        }
    }
    return allRows
}

/**
 * Helper to get active employee IDs in a given unit and period
 */
async function getUnitEmployeeIds(adminClient: any, unitId: string, period: string): Promise<string[]> {
    // 1. Try period snapshot
    const { data: snapEmps } = await adminClient
        .from('t_employee_period_snapshots')
        .select('employee_id')
        .eq('period', period)
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .neq('role', 'superadmin')

    if (snapEmps && snapEmps.length > 0) {
        return snapEmps.map((e: any) => e.employee_id)
    }

    // 2. Fallback to m_employees
    const { data: mEmps } = await adminClient
        .from('m_employees')
        .select('id')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .neq('role', 'superadmin')

    return (mEmps || []).map((e: any) => e.id)
}

async function findEmployeeForUser(adminClient: any, userId: string, authUser: any) {
    const userMeta = authUser.user_metadata || {}
    const appMeta = authUser.app_metadata || {}
    const rawRole = (appMeta.role || userMeta.role || '').toString().toLowerCase()
    const isSuperAdmin = rawRole === 'superadmin' || rawRole === 'admin' || authUser.email === 'admin@sungaipenuh.com'

    const { data: employeeData } = await adminClient
        .from('m_employees')
        .select('id, role, unit_id')
        .eq('user_id', userId)
        .maybeSingle()

    if (employeeData) {
        if (isSuperAdmin) {
            employeeData.role = 'superadmin'
        }
        return employeeData
    }

    if (isSuperAdmin) {
        const { data: adminEmp } = await adminClient
            .from('m_employees')
            .select('id, role, unit_id')
            .or('role.eq.superadmin,role.eq.admin,email.eq.admin@sungaipenuh.com')
            .limit(1)
            .maybeSingle()

        return {
            id: adminEmp?.id || userId,
            role: 'superadmin',
            unit_id: '0'
        }
    }

    return null
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        // Check authentication
        const user = await getAuthenticatedUser(supabase, request)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const adminClient = await createAdminClient()
        const currentEmployee = await findEmployeeForUser(adminClient, user.id, user)

        if (!currentEmployee) {
            return NextResponse.json({ error: 'Employee record not found' }, { status: 404 })
        }

        const { unit_id, current_period, previous_period, revenue_type } = await request.json()

        if (!unit_id || !current_period || !previous_period) {
            return NextResponse.json({ error: 'Parameter unit_id, current_period, dan previous_period harus diisi' }, { status: 400 })
        }

        // Authorization check
        if (currentEmployee.role === 'unit_manager' && currentEmployee.unit_id !== unit_id) {
            return NextResponse.json({ error: 'Anda hanya dapat menyalin penilaian untuk unit Anda sendiri' }, { status: 403 })
        }

        if (currentEmployee.role !== 'superadmin' && currentEmployee.role !== 'unit_manager') {
            return NextResponse.json({ error: 'Hak akses tidak memadai' }, { status: 403 })
        }

        // Check if current period is already approved/locked
        const { data: remCheck } = await adminClient
            .from('remunerasi_periode')
            .select('status')
            .eq('periode', current_period)
            .maybeSingle()

        if (remCheck?.status === 'approved') {
            return NextResponse.json({
                error: `Periode ${current_period} telah disetujui dan terkunci. Penilaian tidak dapat disalin atau diubah.`
            }, { status: 403 })
        }

        // 1. Get employees in target unit for both periods
        const [currentEmpIds, previousEmpIds] = await Promise.all([
            getUnitEmployeeIds(adminClient, unit_id, current_period),
            getUnitEmployeeIds(adminClient, unit_id, previous_period)
        ])

        if (currentEmpIds.length === 0) {
            return NextResponse.json({ error: `Tidak ada pegawai aktif ditemukan di unit ini untuk periode ${current_period}.` }, { status: 400 })
        }

        // 2. Identify common employees (only employees existing in both periods in this unit)
        const previousSet = new Set(previousEmpIds)
        const commonEmployeeIds = currentEmpIds.filter(id => previousSet.has(id))
        const differentCount = currentEmpIds.length - commonEmployeeIds.length

        if (commonEmployeeIds.length === 0) {
            return NextResponse.json({
                error: `Tidak ada pegawai yang sama di unit ini antara periode ${previous_period} dan ${current_period}. Pegawai yang berbeda dapat dinilai secara manual.`
            }, { status: 400 })
        }

        // 3. Fetch assessments from previous period for common employees only
        const previousAssessments = await fetchAllRows(
            adminClient,
            't_kpi_assessments',
            '*',
            (q: any) => {
                let query = q
                    .in('employee_id', commonEmployeeIds)
                    .eq('period', previous_period)

                if (revenue_type && revenue_type !== 'all') {
                    if (revenue_type === 'bpjs') {
                        query = query.or('revenue_type.eq.bpjs,revenue_type.is.null')
                    } else {
                        query = query.eq('revenue_type', revenue_type)
                    }
                }
                return query
            }
        )

        if (!previousAssessments || previousAssessments.length === 0) {
            const revNote = revenue_type && revenue_type !== 'all' ? ` (jenis pendapatan: ${revenue_type.toUpperCase()})` : ''
            return NextResponse.json({
                error: `Tidak ditemukan data penilaian sebelumnya (${previous_period})${revNote} untuk pegawai yang sama di unit ini.`
            }, { status: 404 })
        }

        // 4. Prepare new assessment records
        const nowIso = new Date().toISOString()
        const newAssessments = previousAssessments.map(item => {
            const { id, created_at, updated_at, ...rest } = item
            return {
                ...rest,
                period: current_period,
                assessor_id: currentEmployee.id,
                revenue_type: item.revenue_type || 'bpjs',
                sub_indicator_id: item.sub_indicator_id || null,
                achievement_percentage: item.achievement_percentage !== undefined ? item.achievement_percentage : null,
                score: item.score !== undefined ? item.score : 0,
                updated_at: nowIso
            }
        })

        // Deduplicate records to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const dedupMap = new Map<string, any>()
        for (const ass of newAssessments) {
            const key = `${ass.employee_id}:${ass.indicator_id}:${ass.period}:${ass.sub_indicator_id || 'null'}:${ass.revenue_type}`
            dedupMap.set(key, ass)
        }
        const finalAssessments = Array.from(dedupMap.values())

        // 5. Upsert into t_kpi_assessments with exact 5-column unique index match
        const batchSize = 100
        for (let i = 0; i < finalAssessments.length; i += batchSize) {
            const batch = finalAssessments.slice(i, i + batchSize)
            const { error: upsertError } = await adminClient
                .from('t_kpi_assessments')
                .upsert(batch, {
                    onConflict: 'employee_id,indicator_id,period,sub_indicator_id,revenue_type'
                })

            if (upsertError) {
                console.error('Upsert error in bulk copy batch:', upsertError)
                return NextResponse.json({ error: `Gagal menyimpan data: ${upsertError.message}` }, { status: 500 })
            }
        }

        // 6. Mirror to t_realization to keep realization table fully synchronized
        try {
            const existingRealRows = await fetchAllRows(
                adminClient,
                't_realization',
                'id, employee_id, indicator_id, sub_indicator_id, revenue_type',
                (q: any) => q
                    .in('employee_id', commonEmployeeIds)
                    .eq('period', current_period)
            )

            const existingRealMap = new Map<string, string>()
            for (const row of existingRealRows || []) {
                const key = `${row.employee_id}:${row.indicator_id}:${row.sub_indicator_id || 'main'}:${row.revenue_type || 'bpjs'}`
                existingRealMap.set(key, row.id)
            }

            const realToInsert: any[] = []
            const realToUpdate: { id: string; data: any }[] = []

            for (const ass of finalAssessments) {
                const key = `${ass.employee_id}:${ass.indicator_id}:${ass.sub_indicator_id || 'main'}:${ass.revenue_type}`
                const realPayload = {
                    employee_id: ass.employee_id,
                    indicator_id: ass.indicator_id,
                    sub_indicator_id: ass.sub_indicator_id || null,
                    period: current_period,
                    realization_value: ass.realization_value ?? 0,
                    score: ass.score ?? 0,
                    notes: ass.notes || null,
                    created_by: currentEmployee.id,
                    revenue_type: ass.revenue_type
                }

                const existingId = existingRealMap.get(key)
                if (existingId) {
                    realToUpdate.push({ id: existingId, data: realPayload })
                } else {
                    realToInsert.push(realPayload)
                }
            }

            if (realToInsert.length > 0) {
                for (let i = 0; i < realToInsert.length; i += batchSize) {
                    await adminClient.from('t_realization').insert(realToInsert.slice(i, i + batchSize))
                }
            }
            for (const item of realToUpdate) {
                await adminClient.from('t_realization').update(item.data).eq('id', item.id)
            }
        } catch (mirrorErr) {
            console.warn('Mirror to t_realization non-critical warning:', mirrorErr)
        }

        // 7. Compose success message
        let message = `Berhasil menyalin ${finalAssessments.length} record penilaian untuk ${commonEmployeeIds.length} pegawai dari periode ${previous_period} ke ${current_period}.`
        if (differentCount > 0) {
            message += `\n\nCatatan: Terdapat ${differentCount} pegawai di periode ini yang tidak memiliki penilaian di periode lalu atau baru terdaftar di unit ini, sehingga tidak disalin dan dapat dinilai secara manual.`
        }

        return NextResponse.json({
            success: true,
            message,
            count: finalAssessments.length,
            copied_employees_count: commonEmployeeIds.length,
            unaffected_employees_count: differentCount
        })

    } catch (error: any) {
        console.error('Bulk copy error:', error)
        return NextResponse.json({ error: error.message || 'Terjadi kesalahan sistem saat melakukan penyalinan massal' }, { status: 500 })
    }
}
