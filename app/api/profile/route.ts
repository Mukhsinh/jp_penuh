import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const user = await getAuthenticatedUser(supabase, request)

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const adminSupabase = await createAdminClient()
        let { data: employee } = await adminSupabase
            .from('m_employees')
            .select(`
                id,
                full_name,
                role,
                unit_id,
                m_units (
                  id,
                  name
                )
            `)
            .eq('user_id', user.id)
            .maybeSingle()

        if (!employee && user.email) {
            const { data: empByEmail } = await adminSupabase
                .from('m_employees')
                .select(`
                    id,
                    full_name,
                    role,
                    unit_id,
                    m_units (
                      id,
                      name
                    )
                `)
                .eq('email', user.email)
                .maybeSingle()
            if (empByEmail) employee = empByEmail
        }

        const authRole = user.app_metadata?.role || user.user_metadata?.role || (user as any).role
        const isSuperAdmin = authRole === 'superadmin' || authRole === 'admin' || user.email === 'admin@sungaipenuh.com' || employee?.role === 'superadmin'

        if (!employee) {
            if (isSuperAdmin) {
                employee = {
                    id: user.id,
                    full_name: user.user_metadata?.full_name || 'Super Administrator',
                    role: 'superadmin',
                    unit_id: '0',
                    m_units: { id: '0', name: 'Semua Unit' }
                } as any
            } else {
                return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })
            }
        }

        if (isSuperAdmin && employee) {
            employee.role = 'superadmin'
        }

        return NextResponse.json({
            success: true,
            data: employee
        })
    } catch (error: any) {
        console.error('Profile fetch error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
