import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, role, employee_id } = body

    const supabase = await createClient()

    // Verify user is authenticated and is superadmin
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 })
    }

    // Check if user is superadmin from metadata or email
    const appRole = authUser.app_metadata?.role
    const userRole = authUser.user_metadata?.role
    const isSuperAdmin =
      appRole === 'superadmin' ||
      userRole === 'superadmin' ||
      authUser.email?.toLowerCase() === 'admin@sungaipenuh.com'

    if (!isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Tidak memiliki akses' }, { status: 403 })
    }

    // Use admin client for auth operations
    const adminClient = await createAdminClient()

    // Check if email already exists in auth.users
    const { data: existingAuthUser } = await adminClient.auth.admin.listUsers()
    if (existingAuthUser.users.some(u => u.email === email)) {
      return NextResponse.json({ success: false, error: 'Email sudah digunakan' }, { status: 400 })
    }

    // Create auth user using service role
    // First get the employee's unit_id for metadata
    let employeeUnitId: string | null = null
    if (employee_id) {
      const { data: empData } = await adminClient
        .from('m_employees')
        .select('unit_id')
        .eq('id', employee_id)
        .single()
      employeeUnitId = empData?.unit_id || null
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        ...(employeeUnitId ? { unit_id: employeeUnitId } : {})
      }
    })

    if (authError || !authData.user) {
      return NextResponse.json({ success: false, error: authError?.message || 'Gagal membuat user auth' }, { status: 500 })
    }

    // If employee_id is provided, link it to the auth user and sync role
    if (employee_id) {
      const { error: employeeError } = await adminClient
        .from('m_employees')
        .update({ user_id: authData.user.id, role: role || 'employee' })
        .eq('id', employee_id)

      if (employeeError) {
        // Rollback: delete auth user if employee linking fails
        await adminClient.auth.admin.deleteUser(authData.user.id)
        return NextResponse.json({ success: false, error: employeeError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
