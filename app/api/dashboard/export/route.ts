import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardService } from '@/lib/services/dashboard.service'
import { exportToPDF } from '@/lib/export/pdf-export'

export async function POST(request: NextRequest) {
    try {
        const { period, year, unitId } = await request.json()

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: employee } = await supabase
            .from('m_employees')
            .select('role, unit_id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (!employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
        }

        const isSuperAdmin = user.app_metadata?.role === 'superadmin' || user.email === 'admin@sungaipenuh.com'

        if (!employee.role && isSuperAdmin) {
            employee.role = 'superadmin'
        }

        const effectiveUnitId = employee.role === 'unit_manager' ? employee.unit_id : (unitId === 'all' ? undefined : unitId)

        // Parallel data loading (matching DashboardContent logic)
        const [
            stats,
            topPerformers,
            worstPerformers,
            performanceTrend,
            kpiDistribution,
            unitPerformance
        ] = await Promise.all([
            DashboardService.getDashboardStats(effectiveUnitId, period, year),
            DashboardService.getTopPerformers(10, effectiveUnitId, period, year),
            DashboardService.getWorstPerformers(10, effectiveUnitId, period, year),
            DashboardService.getPerformanceTrend(6, effectiveUnitId, period, year),
            DashboardService.getKPIDistribution(effectiveUnitId, period, year),
            employee.role === 'superadmin' ? DashboardService.getUnitPerformance(period, year) : Promise.resolve([])
        ])

        const buffer = await exportToPDF({
            reportType: 'dashboard-summary',
            period: `${period} ${year}`,
            data: {
                stats,
                topPerformers,
                worstPerformers,
                performanceTrend,
                kpiDistribution,
                unitPerformance,
                user: employee
            }
        } as any)

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Dashboard_Report_${period}_${year}.pdf"`,
            },
        })

    } catch (error: any) {
        console.error('Dashboard Export error:', error)
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        )
    }
}
