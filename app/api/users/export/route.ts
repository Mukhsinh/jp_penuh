import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Verify user is authenticated and is superadmin
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json(
        { error: 'Tidak terautentikasi' },
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
        { error: 'Tidak memiliki akses' },
        { status: 403 }
      )
    }

    // Get all employees with user_id
    const { data: employees, error: employeeError } = await supabase
      .from('m_employees')
      .select(`
        id,
        employee_code,
        full_name,
        unit_id,
        tax_status,
        is_active,
        user_id,
        created_at,
        m_units(id, name)
      `)
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false })

    if (employeeError) {
      return NextResponse.json(
        { error: employeeError.message },
        { status: 500 }
      )
    }

    // Get auth users to get email and role
    const { data: authUsers } = await supabase.auth.admin.listUsers()

    // Transform data for export
    const exportData = (employees || []).map((employee: any) => {
      const authUser = authUsers?.users.find(u => u.id === employee.user_id)
      const unit = Array.isArray(employee.m_units) ? employee.m_units[0] : employee.m_units

      const roleLabels: Record<string, string> = {
        superadmin: 'Superadmin',
        unit_manager: 'Manajer Unit',
        employee: 'Pegawai'
      }

      return {
        'Kode Pegawai': employee.employee_code,
        'Nama Lengkap': employee.full_name,
        'Email': authUser?.email || '',
        'Peran': roleLabels[authUser?.user_metadata?.role] || authUser?.user_metadata?.role || '',
        'Unit': unit?.name || '',
        'Status Pajak': employee.tax_status,
        'Status': employee.is_active ? 'Aktif' : 'Nonaktif',
        'Tanggal Dibuat': new Date(employee.created_at).toLocaleDateString('id-ID')
      }
    })

    // Create workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Kode Pegawai
      { wch: 25 }, // Nama Lengkap
      { wch: 30 }, // Email
      { wch: 15 }, // Peran
      { wch: 25 }, // Unit
      { wch: 12 }, // Status Pajak
      { wch: 10 }, // Status
      { wch: 15 }  // Tanggal Dibuat
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Pengguna')

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=laporan-pengguna-${new Date().toISOString().split('T')[0]}.xlsx`
      }
    })
  } catch (error: any) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
