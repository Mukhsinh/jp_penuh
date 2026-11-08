import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUnitsByPeriod } from '@/lib/services/unit-period.service'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  try {
    const adminClient = await createAdminClient()
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'excel'
    const period = searchParams.get('period')

    let unitsWithCounts: any[] = []
    let periodTitle = ''

    if (period) {
      const periodRes = await getUnitsByPeriod(period)
      unitsWithCounts = (periodRes.data || []).map((u: any) => ({
        ...u,
        employee_count: u.employee_count !== undefined ? u.employee_count : (u.employees?.[0]?.count || 0)
      }))
      periodTitle = ` - Periode ${periodRes.periodInfo.period_name || period}`
    } else {
      // Get all units with employee count
      const { data: rawUnits, error } = await adminClient
        .from('m_units')
        .select('*')
        .order('code', { ascending: true })

      if (error) throw error

      const units = (rawUnits || []).filter((u: any) => {
        const code = String(u.code || '').toUpperCase()
        const name = String(u.name || '').toUpperCase()
        return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
      })

      // Get employee counts
      unitsWithCounts = await Promise.all(
        (units || []).map(async (unit: any) => {
          const { count } = await adminClient
            .from('m_employees')
            .select('*', { count: 'exact', head: true })
            .eq('unit_id', unit.id)
            .neq('role', 'superadmin')

          return {
            ...unit,
            employee_count: count || 0
          }
        })
      )
    }

    // Calculate Totals
    const totalProportion = unitsWithCounts.reduce((sum, unit) => sum + (Number(unit.proportion_percentage) || 0), 0)
    const totalEmployees = unitsWithCounts.reduce((sum, unit) => sum + (Number(unit.employee_count) || 0), 0)

    if (format === 'pdf') {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF()

      // Kop Surat
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('PEMERINTAH KABUPATEN MUARO JAMBI', 105, 15, { align: 'center' })
      doc.setFontSize(16)
      doc.text('RUMAH SAKIT SUNGAI BAHAR', 105, 22, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Kabupaten Muaro Jambi, Provinsi Jambi', 105, 28, { align: 'center' })
      doc.text('Email: admin@sungaipenuh.com', 105, 33, { align: 'center' })

      // Line separator
      doc.setLineWidth(0.5)
      doc.line(20, 38, 190, 38)
      doc.setLineWidth(0.2)
      doc.line(20, 39, 190, 39)

      // Judul Laporan
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(`DAFTAR UNIT KERJA${periodTitle.toUpperCase()}`, 105, 50, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 105, 56, { align: 'center' })

      // Prepare Table Data
      const tableData = unitsWithCounts.map((unit: any, index: number) => [
        index + 1,
        unit.code,
        unit.name,
        (Number(unit.proportion_percentage) || 0).toFixed(2) + '%',
        unit.use_same_proportion !== false ? `${(Number(unit.proportion_percentage) || 0).toFixed(2)}%` : `${(Number(unit.proportion_umum_percentage ?? unit.proportion_percentage) || 0).toFixed(2)}%`,
        unit.employee_count,
        unit.is_active ? 'Aktif' : 'Nonaktif'
      ])

      // Add Total Row
      tableData.push([
        '',
        '',
        'TOTAL',
        totalProportion.toFixed(2) + '%',
        '-',
        totalEmployees,
        ''
      ])

      autoTable(doc, {
        head: [['No', 'Kode', 'Nama Unit', 'Proporsi BPJS', 'Proporsi UMUM', 'Pegawai', 'Status']],
        body: tableData,
        startY: 65,
        theme: 'striped',
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 50 },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 22, halign: 'center' },
          6: { cellWidth: 20, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didParseCell: function(data) {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fillColor = [241, 245, 249]
          }
        }
      })

      const finalY = (doc as any).lastAutoTable.finalY || 150
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Sungai Bahar, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 140, finalY + 20)
      doc.text('Kepala Bagian Umum,', 140, finalY + 25)

      doc.setFont('helvetica', 'bold')
      doc.text('--------------------------', 140, finalY + 45)
      doc.text('NIP. ..........................', 140, finalY + 50)

      const pdfOutput = doc.output('arraybuffer')

      return new NextResponse(pdfOutput, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Laporan_Unit_${period || 'Master'}_${new Date().toISOString().split('T')[0]}.pdf"`
        }
      })
    } else {
      // Generate Excel
      const excelData = unitsWithCounts.map((unit: any, index: number) => ({
        'No': index + 1,
        'Kode Unit': unit.code,
        'Nama Unit': unit.name,
        'Proporsi BPJS (%)': (Number(unit.proportion_percentage) || 0).toFixed(2),
        'Proporsi UMUM (%)': (unit.use_same_proportion !== false ? Number(unit.proportion_percentage) || 0 : Number(unit.proportion_umum_percentage ?? unit.proportion_percentage) || 0).toFixed(2),
        'Jumlah Pegawai': unit.employee_count,
        'Status': unit.is_active ? 'Aktif' : 'Nonaktif'
      }))

      // Add Total Row for Excel
      excelData.push({
        'No': null as any,
        'Kode Unit': '',
        'Nama Unit': 'TOTAL',
        'Proporsi BPJS (%)': totalProportion.toFixed(2),
        'Proporsi UMUM (%)': '-',
        'Jumlah Pegawai': totalEmployees as any,
        'Status': ''
      })

      const wb = XLSX.utils.book_new()

      const header = [
        ['RUMAH SAKIT SUNGAI BAHAR'],
        ['Kabupaten Muaro Jambi, Provinsi Jambi'],
        [`DAFTAR UNIT KERJA${periodTitle.toUpperCase()}`],
        [`Tanggal Cetak: ${new Date().toLocaleString('id-ID')}`],
        []
      ]

      const ws = XLSX.utils.aoa_to_sheet(header)
      XLSX.utils.sheet_add_json(ws, excelData, { origin: 'A6' })

      ws['!cols'] = [
        { wch: 5 },
        { wch: 15 },
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 }
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Data Unit')

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Laporan_Unit_${period || 'Master'}_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      })
    }
  } catch (error: any) {
    console.error('Error generating unit report:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    )
  }
}
