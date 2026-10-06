import { NextRequest, NextResponse } from 'next/server'
import { generateAssessmentGuidePDF } from '@/lib/export/pdf-export'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function POST(request: NextRequest) {
    try {
        const { unitName: reqUnitName, unitId: reqUnitId } = await request.json()

        const supabaseClient = await createClient()
        const user = await getAuthenticatedUser(supabaseClient, request)

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = await createAdminClient()

        // Get user employee info
        let { data: employee } = await supabase
            .from('m_employees')
            .select('role, unit_id, m_units(name)')
            .eq('user_id', user.id)
            .maybeSingle()

        if (!employee && user.email) {
            const { data: empByEmail } = await supabase
                .from('m_employees')
                .select('role, unit_id, m_units(name)')
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
                employee = { role: 'superadmin', unit_id: '0', m_units: [] } as any
            } else {
                return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
            }
        }

        let unitId = reqUnitId
        let unitName = reqUnitName

        if (employee?.role === 'unit_manager') {
            unitId = employee.unit_id
            unitName = (employee.m_units as any)?.name || reqUnitName
        }

        const pdfBytes = await generateAssessmentGuidePDF(unitName, unitId)

        return new Response(pdfBytes as any, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Petunjuk_Penilaian_${(unitName || 'Unit').replace(/\s+/g, '_')}.pdf"`,
            },
        })
    } catch (error: any) {
        console.error('Assessment Guide generation error:', error)
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        )
    }
}
