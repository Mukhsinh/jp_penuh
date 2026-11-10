import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')

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

    // Get audit logs
    let query = supabase
      .from('t_audit_logs')
      .select(`
        id,
        action,
        table_name,
        description,
        created_at,
        user_id,
        m_users(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Filter by unit for unit managers
    if (employee.role === 'unit_manager') {
      query = query.eq('unit_id', employee.unit_id)
    } else if (employee.role === 'employee') {
      query = query.eq('user_id', user.id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Activities query error:', error)
      return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 })
    }

    // Format activities
    const activities = data?.map((log: any) => {
      let type: 'realization' | 'calculation' | 'approval' | 'report' = 'report'

      if (log.table_name === 't_kpi_realizations') {
        type = 'realization'
      } else if (log.action === 'calculate') {
        type = 'calculation'
      } else if (log.action === 'approve') {
        type = 'approval'
      }

      return {
        id: log.id,
        type,
        description: log.description || `${log.action} pada ${log.table_name}`,
        user: Array.isArray(log.m_users) && log.m_users.length > 0
          ? log.m_users[0].full_name
          : 'Unknown User',
        timestamp: new Date(log.created_at)
      }
    }) || []

    return NextResponse.json(activities)
  } catch (error) {
    console.error('Activities error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
