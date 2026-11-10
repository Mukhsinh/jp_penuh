import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { DashboardService } from '@/lib/services/dashboard.service'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())

    // Get current user robustly without hitting Supabase Auth rate limits
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get employee data
    const { data: employee } = await supabase
      .from('m_employees')
      .select('id, role, unit_id')
      .eq('user_id', user.id)
      .single()

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const unitId = searchParams.get('unitId') || 'all'
    const period = searchParams.get('period') || undefined

    // Use refined Service logic instead of the bugged RPC
    const trendData = await DashboardService.getPerformanceTrend(6, unitId, period)

    const response = NextResponse.json(trendData)

    // Add caching headers (cache for 5 minutes)
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300')

    return response
  } catch (error) {
    console.error('Performance data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
