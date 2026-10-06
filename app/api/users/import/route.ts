import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

interface ImportRow {
  'Kode Pegawai': string
  'Nama Lengkap': string
  'Email': string
  'Password': string
  'Peran': string
  'Unit ID': string
  'Status Pajak': string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File tidak ditemukan' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify user is authenticated and is superadmin
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
        { success: false, error: 'Tidak memiliki akses' },
        { status: 403 }
      )
    }

    // Read Excel file
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json<ImportRow>(worksheet)

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File kosong' },
        { status: 400 }
      )
    }

    let imported = 0
    const errors: string[] = []

    for (const row of data) {
      try {
        // Validate required fields
        if (!row['Kode Pegawai'] || !row['Nama Lengkap'] || !row['Email'] || !row['Password']) {
          errors.push(`Baris ${imported + 1}: Data tidak lengkap`)
          continue
        }

        // Validate role
        const validRoles = ['superadmin', 'unit_manager', 'employee']
        if (!validRoles.includes(row['Peran'])) {
          errors.push(`Baris ${imported + 1}: Peran tidak valid`)
          continue
        }

        // Check if employee code already exists
        const { data: existingEmployee } = await supabase
          .from('m_employees')
          .select('id')
          .eq('employee_code', row['Kode Pegawai'])
          .single()

        if (existingEmployee) {
          errors.push(`Baris ${imported + 1}: Kode pegawai ${row['Kode Pegawai']} sudah ada`)
          continue
        }

        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: row['Email'],
          password: row['Password'],
          email_confirm: true,
          user_metadata: {
            role: row['Peran'],
            full_name: row['Nama Lengkap'],
            unit_id: row['Unit ID'] || null
          }
        })

        if (authError) {
          errors.push(`Baris ${imported + 1}: ${authError.message}`)
          continue
        }

        if (!authData.user) {
          errors.push(`Baris ${imported + 1}: Gagal membuat auth user`)
          continue
        }

        // Create employee record
        const { error: employeeError } = await supabase
          .from('m_employees')
          .insert({
            user_id: authData.user.id,
            employee_code: row['Kode Pegawai'],
            full_name: row['Nama Lengkap'],
            unit_id: row['Unit ID'] || null,
            tax_status: row['Status Pajak'] || 'TK/0',
            is_active: true
          })

        if (employeeError) {
          // Rollback: delete auth user
          await supabase.auth.admin.deleteUser(authData.user.id)
          errors.push(`Baris ${imported + 1}: ${employeeError.message}`)
          continue
        }

        imported++
      } catch (err: any) {
        errors.push(`Baris ${imported + 1}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      total: data.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
