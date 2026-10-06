import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID diperlukan' },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    // Verify user is authenticated
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      )
    }

    // Check if user is superadmin from metadata or email
    const appRole = authUser.app_metadata?.role
    const userRole = authUser.user_metadata?.role
    const isSuperAdmin =
      appRole === 'superadmin' ||
      userRole === 'superadmin' ||
      authUser.email === 'admin@sungaipenuh.com'

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Hanya superadmin yang dapat menghapus user' },
        { status: 403 }
      )
    }

    // Prevent self-deletion
    if (userId === authUser.id) {
      return NextResponse.json(
        { success: false, error: 'Tidak dapat menghapus akun sendiri' },
        { status: 400 }
      )
    }

    // Create admin client with service role key for user deletion
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Delete employee record first (will cascade to related data)
    const { error: employeeError } = await supabaseAdmin
      .from('m_employees')
      .delete()
      .eq('user_id', userId)

    if (employeeError) {
      return NextResponse.json(
        { success: false, error: employeeError.message },
        { status: 500 }
      )
    }

    // Delete auth user using admin client
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authError) {
      return NextResponse.json(
        { success: false, error: authError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete user error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
