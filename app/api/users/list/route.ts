import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = await createAdminClient()

    // Verify user is authenticated and is superadmin
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Tidak terautentikasi' },
        { status: 401 }
      )
    }

    // Check if user is superadmin from metadata or email
    const appRole = user.app_metadata?.role
    const userRole = user.user_metadata?.role
    const isSuperAdmin =
      appRole === 'superadmin' ||
      userRole === 'superadmin' ||
      user.email === 'admin@sungaipenuh.com'

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Tidak memiliki akses' },
        { status: 403 }
      )
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const searchTerm = searchParams.get('search') || ''

    // Get employees
    let query = supabase
      .from('m_employees')
      .select(`
        id,
        user_id,
        employee_code,
        full_name,
        unit_id,
        tax_status,
        is_active,
        created_at,
        updated_at,
        m_units(name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })

    // Apply search filter
    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,employee_code.ilike.%${searchTerm}%`)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: employees, error: empError, count } = await query

    if (empError) {
      return NextResponse.json(
        { error: empError.message },
        { status: 500 }
      )
    }

    // Get auth user data for each employee using service role
    const users = []

    for (const emp of employees || []) {
      try {
        // Get user from auth.users
        const { data: { user: authUser }, error: userError } = await adminClient.auth.admin.getUserById(emp.user_id)

        if (!userError && authUser) {
          users.push({
            id: authUser.id,
            email: authUser.email || '',
            role: authUser.user_metadata?.role || 'employee',
            employee_id: emp.id,
            is_active: emp.is_active,
            created_at: authUser.created_at,
            updated_at: authUser.updated_at || authUser.created_at,
            pegawai: {
              id: emp.id,
              employee_code: emp.employee_code,
              full_name: emp.full_name,
              unit_id: emp.unit_id,
              tax_status: emp.tax_status,
              is_active: emp.is_active,
              created_at: emp.created_at,
              updated_at: emp.updated_at,
              m_units: Array.isArray(emp.m_units) && emp.m_units.length > 0
                ? emp.m_units[0]
                : undefined
            }
          })
        }
      } catch (err) {
        console.error('Error fetching user:', emp.user_id, err)
      }
    }

    return NextResponse.json({
      data: users,
      count: count || 0
    })

  } catch (error: any) {
    console.error('Error in users list API:', error)
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan' },
      { status: 500 }
    )
  }
}
