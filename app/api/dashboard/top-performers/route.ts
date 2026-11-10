import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())
    const limit = parseInt(searchParams.get('limit') || '10')

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

    // Build query based on role
    let query = supabase
      .from('t_kpi_realizations')
      .select(`
        id,
        final_score,
        employee_id,
        m_employees!inner(
          id,
          full_name,
          unit_id,
          m_units(name)
        )
      `)
      .eq('year', year)
      .eq('month', month)
      .order('final_score', { ascending: false })
      .limit(limit)

    // Filter by unit for unit managers
    if (employee.role === 'unit_manager') {
      query = query.eq('unit_id', employee.unit_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Top performers query error:', error)
      return NextResponse.json({ error: 'Failed to fetch top performers' }, { status: 500 })
    }

    // Format the data
    const performers = data?.map((item: any, index: number) => ({
      id: item.employee_id,
      name: item.m_employees.full_name,
      unit: Array.isArray(item.m_employees.m_units) && item.m_employees.m_units.length > 0
        ? item.m_employees.m_units[0].name
        : 'Unknown',
      score: item.final_score || 0,
      rank: index + 1
    })) || []

    return NextResponse.json(performers)
  } catch (error) {
    console.error('Top performers error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
