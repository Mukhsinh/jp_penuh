import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id, email, password, role, unit_id, employee_id } = body

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

    // Update auth user metadata
    const updateData: any = {}
    if (email) updateData.email = email
    if (password) updateData.password = password

    // Build user_metadata object
    const userMetadata: any = {}
    if (role) userMetadata.role = role
    if (unit_id) userMetadata.unit_id = unit_id

    if (Object.keys(userMetadata).length > 0) {
      // Get existing metadata first
      const { data: existingUser } = await adminClient.auth.admin.getUserById(id)
      updateData.user_metadata = {
        ...existingUser?.user?.user_metadata,
        ...userMetadata
      }
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(id, updateData)

    if (authError) {
      return NextResponse.json({ success: false, error: authError.message }, { status: 500 })
    }

    // Build employee update fields (role + unit_id)
    const employeeUpdate: Record<string, any> = {}
    if (role) employeeUpdate.role = role
    if (unit_id !== undefined) employeeUpdate.unit_id = unit_id

    // Update employee record (role and/or unit_id)
    if (Object.keys(employeeUpdate).length > 0) {
      const { error: employeeError } = await adminClient
        .from('m_employees')
        .update(employeeUpdate)
        .eq('user_id', id)

      if (employeeError) {
        console.error('Error updating employee record:', employeeError)
        return NextResponse.json({ success: false, error: employeeError.message }, { status: 500 })
      }
    }

    // Update employee link if employee_id changed
    if (employee_id !== undefined) {
      // Remove old link if exists
      await adminClient
        .from('m_employees')
        .update({ user_id: null })
        .eq('user_id', id)

      // Add new link if employee_id is provided
      if (employee_id) {
        // Also set role on the newly linked employee
        const linkUpdate: Record<string, any> = { user_id: id }
        if (role) linkUpdate.role = role

        const { error: employeeError } = await adminClient
          .from('m_employees')
          .update(linkUpdate)
          .eq('id', employee_id)

        if (employeeError) {
          return NextResponse.json({ success: false, error: employeeError.message }, { status: 500 })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
