import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const type = searchParams.get('type')

        const supabaseClient = await createClient()
        const user = await getAuthenticatedUser(supabaseClient, request)

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = await createAdminClient()

        // Get user employee info
        let { data: employee } = await supabase
            .from('m_employees')
            .select('id, role, unit_id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (!employee && user.email) {
            const { data: empByEmail } = await supabase
                .from('m_employees')
                .select('id, role, unit_id')
                .eq('email', user.email)
                .maybeSingle()
            if (empByEmail) {
                employee = empByEmail
            }
        }

        const authRole = user.app_metadata?.role || user.user_metadata?.role || (user as any).role
        const isSuperAdmin = authRole === 'superadmin' || authRole === 'admin' || user.email === 'admin@sungaipenuh.com'

        if (!employee) {
            if (isSuperAdmin) {
                employee = { id: user.id, role: 'superadmin', unit_id: '0' }
            } else {
                return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
            }
        }

        // Force role override if auth metadata says superadmin
        if (isSuperAdmin && employee) {
            employee.role = 'superadmin'
        }

        if (type === 'units') {
            let query = supabase
                .from('m_units')
                .select('id, name, code')
                .eq('is_active', true)
                .neq('code', 'ADMIN')
                .order('name')
                .range(0, 9999)

            if (employee.role === 'unit_manager') {
                query = query.eq('id', employee.unit_id)
            }

            const { data, error } = await query

            if (error) throw error
            return NextResponse.json({ success: true, data })
        }

        if (type === 'employees') {
            let query = supabase
                .from('m_employees')
                .select('id, full_name, unit_id, employee_code, role')
                .eq('is_active', true)
                .neq('role', 'superadmin')
                .order('full_name')
                .range(0, 9999)

            if (employee.role === 'unit_manager') {
                query = query.eq('unit_id', employee.unit_id)
            }

            const { data, error } = await query

            if (error) throw error
            return NextResponse.json({ success: true, data })
        }

        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    } catch (error: any) {
        console.error('Metadata fetch error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
