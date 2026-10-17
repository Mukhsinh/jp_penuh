import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()

        // Check authentication
        const user = await getAuthenticatedUser(supabase, request)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const adminClient = await createAdminClient()

        // Get current user's employee record
        let currentEmployee: any = null
        const { data: byUserId } = await adminClient
            .from('m_employees')
            .select('id, role, unit_id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (byUserId) {
            currentEmployee = byUserId
        } else if (user.email) {
            const { data: byEmail } = await adminClient
                .from('m_employees')
                .select('id, role, unit_id')
                .eq('email', user.email)
                .maybeSingle()
            if (byEmail) currentEmployee = byEmail
        }

        const appRole = user.app_metadata?.role
        const userRole = user.user_metadata?.role
        const isSuperAdmin =
            appRole === 'superadmin' ||
            userRole === 'superadmin' ||
            user.email === 'admin@sungaipenuh.com'

        if (!currentEmployee) {
            if (isSuperAdmin) {
                currentEmployee = {
                    id: user.id,
                    role: 'superadmin',
                    unit_id: '0'
                }
            } else {
                return NextResponse.json({ error: 'Employee record not found' }, { status: 404 })
            }
        }

        const { searchParams } = new URL(request.url)
        const employeeId = searchParams.get('employee_id')
        const currentPeriod = searchParams.get('current_period')

        if (!employeeId || !currentPeriod) {
            return NextResponse.json(
                { error: 'employee_id and current_period are required' },
                { status: 400 }
            )
        }

        // Enforce unit isolation for unit managers
        if (currentEmployee.role === 'unit_manager') {
            const { data: targetEmployee } = await adminClient
                .from('m_employees')
                .select('unit_id')
                .eq('id', employeeId)
                .single()

            if (!targetEmployee || targetEmployee.unit_id !== currentEmployee.unit_id) {
                return NextResponse.json(
                    { error: 'You can only view assessments for employees in your unit' },
                    { status: 403 }
                )
            }
        }

        // Since `period` looks like 'Februari 2026', matching string order might not represent time correctly.
        // However, finding the MOST RECENT period that is NOT the current_period can help.
        // A simplified approach is just sorting by created_at DESC from `t_kpi_assessments` 
        // where period != current_period to find the last time this employee was assessed.

        const revenueType = searchParams.get('revenue_type') || 'bpjs'

        // First, find the period of the last assessment for this revenue_type
        const { data: lastAssessment, error: lastError } = await adminClient
            .from('t_kpi_assessments')
            .select('period')
            .eq('employee_id', employeeId)
            .neq('period', currentPeriod)
            .or(`revenue_type.eq.${revenueType},revenue_type.is.null`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (lastError || !lastAssessment) {
            // It's okay if they have no previous assessment
            return NextResponse.json({ assessments: [] })
        }

        const previousPeriod = lastAssessment.period;

        // Then fetch all assessments for that previous period and revenue_type
        const { data, error } = await adminClient
            .from('t_kpi_assessments')
            .select('*')
            .eq('employee_id', employeeId)
            .eq('period', previousPeriod)
            .or(`revenue_type.eq.${revenueType},revenue_type.is.null`)
            .order('created_at')

        if (error) {
            throw new Error(`Failed to fetch previous assessments: ${error.message}`)
        }

        return NextResponse.json({ assessments: data || [], previous_period: previousPeriod })
    } catch (error: any) {
        console.error('Assessment previous GET error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch previous assessments' },
            { status: 500 }
        )
    }
}
