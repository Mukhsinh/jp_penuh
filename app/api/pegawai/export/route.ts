import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

// Add type for jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if superadmin from metadata or email
    const appRole = user.app_metadata?.role
    const userRole = user.user_metadata?.role
    const isSuperAdmin =
      appRole === 'superadmin' ||
      userRole === 'superadmin' ||
      user.email === 'admin@sungaipenuh.com'

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'excel'

    // Use admin client to bypass RLS and get ALL employees for the report
    const adminClient = await createAdminClient()
    const { data: pegawai, error } = await adminClient
      .from('m_employees')
      .select(`
        *,
        m_units (
          code,
          name
        )
      `)
      .order('employee_code', { ascending: true })

    if (error) throw error

    const reportDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    if (format === 'pdf') {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      }) as jsPDFWithAutoTable

      // Formal KOP Surat
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('RUMAH SAKIT SUNGAI BAHAR', 148.5, 15, { align: 'center' })

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Kabupaten Muaro Jambi, Provinsi Jambi', 148.5, 21, { align: 'center' })
      doc.text('Telepon: - | Website: -', 148.5, 26, { align: 'center' })

      // Line separator
      doc.setLineWidth(0.5)
      doc.line(15, 30, 282, 30)
      doc.setLineWidth(0.1)
      doc.line(15, 31, 282, 31)

      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('LAPORAN DATA PEGAWAI', 148.5, 40, { align: 'center' })

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Tanggal Laporan: ${reportDate}`, 15, 48)

      // Table Data
      const tableRows = (pegawai || []).map((p, index) => [
        index + 1,
        p.employee_code,
        p.full_name,
        p.m_units?.name || '-',
        p.position || '-',
        p.employment_status || '-',
        p.tax_status || '-',
        p.is_active ? 'Aktif' : 'Non-Aktif'
      ])

      doc.autoTable({
        startY: 52,
        head: [['No', 'NIP/Kode', 'Nama Lengkap', 'Unit Kerja', 'Jabatan', 'Status', 'Pajak', 'Status Akun']],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 30 },
          2: { cellWidth: 60 },
          3: { cellWidth: 50 },
          4: { cellWidth: 40 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
          7: { cellWidth: 25 }
        },
        didDrawPage: (data: any) => {
          // Footer
          const pageCount = (doc as any).getNumberOfPages()
          doc.setFontSize(8)
          doc.text(`Halaman ${data.pageNumber} dari ${pageCount}`, 282, 195, { align: 'right' })
        }
      })

      // Signature area on final page
      const finalY = (doc as any).lastAutoTable.finalY + 15
      if (finalY < 180) {
        doc.text('Sungai Bahar, ' + reportDate, 230, finalY)
        doc.text('Admin Sistem,', 230, finalY + 7)
        doc.text('( ____________________ )', 230, finalY + 30)
      }

      const pdfOutput = doc.output('arraybuffer')

      return new NextResponse(pdfOutput, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Laporan_Pegawai_${new Date().toISOString().split('T')[0]}.pdf"`
        }
      })
    } else {
      // Generate Excel with formal header
      const worksheetData = [
        ['RUMAH SAKIT SUNGAI BAHAR'],
        ['Kabupaten Muaro Jambi, Provinsi Jambi'],
        ['LAPORAN DATA PEGAWAI'],
        [`Tanggal Laporan: ${reportDate}`],
        [], // Empty row
        ['No', 'Kode Pegawai', 'NIK', 'Nama Lengkap', 'Unit', 'Jabatan', 'Status Kerja', 'Status Pajak', 'Bank', 'No. Rekening', 'Status Akun']
      ]

      const employeeData = (pegawai || []).map((p, index) => [
        index + 1,
        p.employee_code,
        p.nik || '',
        p.full_name,
        p.m_units?.name || '',
        p.position || '',
        p.employment_status || '',
        p.tax_status || '',
        p.bank_name || '',
        p.bank_account_number || '',
        p.is_active ? 'Aktif' : 'Nonaktif'
      ])

      const finalData = [...worksheetData, ...employeeData]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(finalData)

      // Column widths
      ws['!cols'] = [
        { wch: 5 },  // No
        { wch: 15 }, // Kode
        { wch: 18 }, // NIK
        { wch: 30 }, // Nama
        { wch: 25 }, // Unit
        { wch: 25 }, // Jabatan
        { wch: 15 }, // Status Kerja
        { wch: 12 }, // Pajak
        { wch: 15 }, // Bank
        { wch: 20 }, // Rekening
        { wch: 12 }  // Status Akun
      ]

      // Merge header cells
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }, // Title
        { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }, // Address
        { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } }, // Report Title
        { s: { r: 3, c: 0 }, e: { r: 3, c: 10 } }  // Date
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Data Pegawai')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Laporan_Pegawai_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      })
    }
  } catch (error: any) {
    console.error('Error exporting pegawai:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export pegawai' },
      { status: 500 }
    )
  }
}
