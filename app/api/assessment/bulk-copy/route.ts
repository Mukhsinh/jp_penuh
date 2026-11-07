import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const adminClient = await createAdminClient()

        // Get current user's employee record
        const { data: currentEmployee } = await adminClient
            .from('m_employees')
            .select('id, role, unit_id')
            .eq('user_id', user.id)
            .single()

        if (!currentEmployee) {
            return NextResponse.json({ error: 'Employee record not found' }, { status: 404 })
        }

        const { unit_id, current_period, previous_period } = await request.json()

        if (!unit_id || !current_period || !previous_period) {
            return NextResponse.json({ error: 'Missing required parameters (unit_id, current_period, previous_period)' }, { status: 400 })
        }

        // Authorization check
        if (currentEmployee.role === 'unit_manager' && currentEmployee.unit_id !== unit_id) {
            return NextResponse.json({ error: 'Forbidden: You can only copy assessments for your own unit' }, { status: 403 })
        }

        if (currentEmployee.role !== 'superadmin' && currentEmployee.role !== 'unit_manager') {
            return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 })
        }

        // 1. Get all employees in this unit for current_period
        let employees: any[] = []
        const { data: snapEmps } = await adminClient
            .from('t_employee_period_snapshots')
            .select('employee_id')
            .eq('period', current_period)
            .eq('unit_id', unit_id)
            .eq('is_active', true)
            .neq('role', 'superadmin')

        if (snapEmps && snapEmps.length > 0) {
            employees = snapEmps.map(e => ({ id: e.employee_id }))
        } else {
            const { data: mEmps } = await adminClient
                .from('m_employees')
                .select('id')
                .eq('unit_id', unit_id)
                .eq('is_active', true)
                .neq('role', 'superadmin')
            employees = mEmps || []
        }

        if (!employees || employees.length === 0) {
            return NextResponse.json({ message: 'Tidak ada pegawai aktif ditemukan di unit ini.' })
        }

        const employeeIds = employees.map(e => e.id)

        // 2. Get all assessments for these employees in previous period
        const { data: previousAssessments } = await adminClient
            .from('t_kpi_assessments')
            .select('*')
            .in('employee_id', employeeIds)
            .eq('period', previous_period)

        if (!previousAssessments || previousAssessments.length === 0) {
            return NextResponse.json({
                error: `Tidak ditemukan data penilaian sebelumnya (${previous_period}) untuk unit yang dipilih.`
            }, { status: 404 })
        }

        // We filter out generated fields and update period/assessor
        const newAssessments = previousAssessments.map(item => {
            const { id, created_at, updated_at, achievement_percentage, score, ...rest } = item
            return {
                ...rest,
                period: current_period,
                assessor_id: currentEmployee.id
            }
        })

        // Using upsert with onConflict for all relevant keys
        const { data, error: upsertError } = await adminClient
            .from('t_kpi_assessments')
            .upsert(newAssessments, {
                onConflict: 'employee_id,indicator_id,period,sub_indicator_id'
            })

        if (upsertError) {
            console.error('Upsert error in bulk copy:', upsertError)
            return NextResponse.json({ error: `Gagal menyimpan data: ${upsertError.message}` }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: `Berhasil menyalin ${newAssessments.length} record penilaian untuk ${employees.length} pegawai dari ${previous_period} ke ${current_period}.`,
            count: newAssessments.length
        })

    } catch (error: any) {
        console.error('Bulk copy error:', error)
        return NextResponse.json({ error: 'Terjadi kesalahan sistem saat melakukan penyalinan massal' }, { status: 500 })
    }
}
