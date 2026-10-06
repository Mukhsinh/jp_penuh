import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unitId = searchParams.get('unitId')
    const format = searchParams.get('format') || 'excel'
    const revenueType = searchParams.get('revenueType') || 'all'

    if (!unitId) {
      return NextResponse.json({ error: 'Unit ID diperlukan' }, { status: 400 })
    }

    const adminClient = await createAdminClient()
    const supabase = await createClient()

    // Get settings for app info
    const { data: settingsData } = await adminClient
      .from('t_settings')
      .select('key, value')
      .in('key', ['company_info', 'footer'])

    let appSettings = {
      appName: 'JASPEL',
      developerName: '',
      organizationName: 'RUMAH SAKIT SUNGAI BAHAR',
      address: 'Kabupaten Muaro Jambi, Provinsi Jambi',
      logo: '',
      footerText: ''
    }

    if (settingsData) {
      const companyInfo = (settingsData.find(s => s.key === 'company_info')?.value as any) || {}
      const footerInfo = (settingsData.find(s => s.key === 'footer')?.value as any) || {}

      appSettings = {
        appName: companyInfo.appName || 'JASPEL',
        developerName: companyInfo.developerName || '',
        organizationName: companyInfo.name || 'RUMAH SAKIT SUNGAI BAHAR',
        address: companyInfo.address || 'Kabupaten Muaro Jambi, Provinsi Jambi',
        logo: companyInfo.logo || '',
        footerText: typeof footerInfo === 'string' ? footerInfo : (footerInfo.text || '')
      }
    }

    // Get unit info including schema mode
    const { data: unit, error: unitError } = await adminClient
      .from('m_units')
      .select('code, name, kpi_schema_mode')
      .eq('id', unitId)
      .single()

    if (unitError || !unit) {
      return NextResponse.json({ error: 'Unit tidak ditemukan' }, { status: 404 })
    }

    // Get KPI categories filtering by revenueType
    const allowedRevenueTypes = revenueType === 'all' ? ['all', 'bpjs', 'umum'] : [revenueType, 'all']

    let categoriesQuery = adminClient
      .from('m_kpi_categories')
      .select('*')
      .eq('unit_id', unitId)
      .eq('is_active', true)

    if (revenueType !== 'all') {
      categoriesQuery = categoriesQuery.or(`revenue_type.in.(${allowedRevenueTypes.join(',')}),revenue_type.is.null`)
    }

    const { data: categories, error: categoriesError } = await categoriesQuery.order('category')

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError)
      return NextResponse.json({ error: 'Gagal mengambil data kategori KPI' }, { status: 500 })
    }

    // Get indicators for each category
    const categoriesWithData = []
    for (const category of categories || []) {
      const { data: indicators, error: indicatorsError } = await adminClient
        .from('m_kpi_indicators')
        .select('*')
        .eq('category_id', category.id)
        .eq('is_active', true)
        .order('code')

      if (indicatorsError) {
        console.error('Error fetching indicators:', indicatorsError)
        continue
      }

      // Get sub indicators for each indicator
      const indicatorsWithSubs = []
      for (const indicator of indicators || []) {
        const { data: subIndicators, error: subError } = await adminClient
          .from('m_kpi_sub_indicators')
          .select('*')
          .eq('indicator_id', indicator.id)
          .eq('is_active', true)
          .order('code')

        if (subError) {
          console.error('Error fetching sub indicators:', subError)
        }

        indicatorsWithSubs.push({
          ...indicator,
          m_kpi_sub_indicators: subIndicators || []
        })
      }

      categoriesWithData.push({
        ...category,
        m_kpi_indicators: indicatorsWithSubs
      })
    }

    if (format === 'excel') {
      return generateExcelReport(unit, categoriesWithData || [], appSettings, revenueType)
    } else if (format === 'pdf') {
      return generatePDFReport(unit, categoriesWithData || [], appSettings, revenueType)
    } else {
      return NextResponse.json({ error: 'Format tidak didukung' }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Gagal mengekspor laporan' }, { status: 500 })
  }
}

async function generatePDFReport(unit: any, categories: any[], appSettings: any, revenueType: string) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  let logoBase64: string | null = null
  if (appSettings.logo) {
    if (appSettings.logo.startsWith('data:image')) {
      logoBase64 = appSettings.logo
    } else if (appSettings.logo.startsWith('http://') || appSettings.logo.startsWith('https://')) {
      try {
        const res = await fetch(appSettings.logo)
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const mimeType = appSettings.logo.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
          logoBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`
        }
      } catch (e) {
        console.error('Error fetching logo for PDF export:', e)
      }
    }
  }

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const centerX = pageWidth / 2

  const getRevenueLabel = (type: string) => {
    if (type === 'bpjs') return 'SKEMA BPJS KESEHATAN'
    if (type === 'umum') return 'SKEMA PENDAPATAN UMUM'
    return 'SKEMA GABUNGAN (BPJS & UMUM)'
  }

  const drawKopSurat = () => {
    if (logoBase64) {
      try {
        const format = logoBase64.includes('image/png') ? 'PNG' : 'JPEG'
        doc.addImage(logoBase64, format, 15, 9, 22, 22)
      } catch (err) {
        console.error('Failed to draw logo on Kop Surat:', err)
      }
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('PEMERINTAH KABUPATEN MUARO JAMBI', centerX, 14, { align: 'center' })

    doc.setFontSize(15)
    doc.text((appSettings.organizationName || 'RUMAH SAKIT SUNGAI BAHAR').toUpperCase(), centerX, 21, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(appSettings.address || 'Kabupaten Muaro Jambi, Provinsi Jambi', centerX, 26, { align: 'center' })
    doc.text('Email: admin@sungaipenuh.com | Dokumen Resmi Sistem JASPEL', centerX, 31, { align: 'center' })

    doc.setDrawColor(15, 23, 42)
    doc.setLineWidth(0.8)
    doc.line(15, 35, pageWidth - 15, 35)
    doc.setLineWidth(0.2)
    doc.line(15, 36.5, pageWidth - 15, 36.5)
  }

  drawKopSurat()

  // Title Banner
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('PEDOMAN KPI UNIT', centerX, 44, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 58, 138)
  doc.text(`[ ${getRevenueLabel(revenueType)} ]`, centerX, 50, { align: 'center' })

  let currentY = 56

  // Metadata (Tanpa Frame Box)
  const isDiffMode = (unit.kpi_schema_mode as string) === 'different'

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('Unit Kerja', 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${unit.code} - ${unit.name}`, 55, currentY)
  currentY += 5.5

  doc.setFont('helvetica', 'bold')
  doc.text('Skema Unit', 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${isDiffMode ? 'KPI Berbeda per Jenis Pendapatan (BPJS vs UMUM)' : 'KPI Sama untuk Semua Jenis Pendapatan'}`, 55, currentY)
  currentY += 5.5

  doc.setFont('helvetica', 'bold')
  doc.text('Kategori Revenue', 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${getRevenueLabel(revenueType)}`, 55, currentY)
  currentY += 5.5

  doc.setFont('helvetica', 'bold')
  doc.text('Tanggal Cetak', 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 55, currentY)

  currentY += 10

  let grandTotalIndicators = 0
  let grandTotalSubIndicators = 0
  let grandTotalCategoryWeight = 0

  categories.forEach((cat) => {
    const catRevBadge = cat.revenue_type === 'umum'
      ? '[PENDAPATAN UMUM]'
      : cat.revenue_type === 'bpjs'
        ? '[BPJS KESEHATAN]'
        : '[SEMUA REVENUE]'

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(`Kategori ${cat.category}: ${cat.category_name} (${cat.weight_percentage}%) ${isDiffMode ? catRevBadge : ''}`, 15, currentY)
    currentY += 6

    const indicators = cat.m_kpi_indicators || []
    let totalWeightInCategory = 0
    grandTotalCategoryWeight += Number(cat.weight_percentage || 0)

    const tableBody: any[] = []
    indicators.forEach((ind: any) => {
      grandTotalIndicators++
      totalWeightInCategory += Number(ind.weight_percentage || 0)

      const formatBaseVal = (val: any) => {
        if (!val || Number(val) === 0) return '-'
        const n = Number(val)
        return n >= 1000
          ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
          : new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(n)
      }

      // Main Indicator Row
      tableBody.push([
        { content: ind.code, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: ind.name, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: ind.calculation_method === 'priority' ? 'Prioritas' : `${ind.weight_percentage}%`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } },
        { content: ind.target_value || 0, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } },
        { content: ind.measurement_unit || '-', styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } },
        { content: formatBaseVal(ind.base_index_value), styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'right' } }
      ])

      // Sub Indicators Rows
      const subs = ind.m_kpi_sub_indicators || []
      subs.forEach((sub: any) => {
        grandTotalSubIndicators++

        let criteriaText = '-'
        if (sub.scoring_criteria && Array.isArray(sub.scoring_criteria) && sub.scoring_criteria.length > 0) {
          criteriaText = sub.scoring_criteria
            .map((c: any) => `• ${c.label || ''} (Skor: ${c.score ?? '-'})`)
            .join('\n')
        } else if (sub.measurement_type === 'quantitative') {
          criteriaText = `Kuantitatif | Tarif Dasar: ${formatBaseVal(sub.base_index_value)}`
        }

        tableBody.push([
          `   ${sub.code}`,
          sub.name + (sub.description ? `\n(${sub.description})` : ''),
          `${sub.weight_percentage}%`,
          sub.target_value || 0,
          sub.measurement_unit || '-',
          criteriaText
        ])
      })
    })

    autoTable(doc, {
      startY: currentY,
      head: [['Kode', 'Indikator / Sub-Indikator', 'Bobot', 'Target', 'Satuan', 'Tarif Dasar / Indeks / Kriteria']],
      body: tableBody,
      foot: [[
        '',
        { content: 'SUBTOTAL BOBOT INDIKATOR KATEGORI', styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `${totalWeightInCategory}%`, styles: { fontStyle: 'bold', halign: 'center' } },
        '',
        '',
        ''
      ]],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 60 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 'auto' }
      },
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        currentY = data.cursor?.y || currentY
      }
    })

    currentY = (doc as any).lastAutoTable.finalY + 10

    if (currentY > pageHeight - 50) {
      doc.addPage()
      drawKopSurat()
      currentY = 45
    }
  })

  // Formal Regulatory Approval Signature Block
  if (currentY > pageHeight - 50) {
    doc.addPage()
    drawKopSurat()
    currentY = 45
  }

  const signY = currentY
  const col1X = 25
  const col2X = pageWidth - 75

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text('Mengetahui / Penanggung Jawab,', col1X, signY)
  doc.text('Disetujui Oleh,', col2X, signY)

  const unitTitleName = unit.name.toUpperCase().startsWith('UNIT') ? unit.name : `Unit ${unit.name}`
  doc.text(`Kepala ${unitTitleName}`, col1X, signY + 5)
  doc.text('Direktur / Management RSUD', col2X, signY + 5)

  doc.line(col1X, signY + 28, col1X + 50, signY + 28)
  doc.text('NIP. .....................................', col1X, signY + 33)

  doc.line(col2X, signY + 28, col2X + 50, signY + 28)
  doc.text('NIP. .....................................', col2X, signY + 33)

  // Running Footer for all pages
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(`Halaman ${i} dari ${pageCount}`, centerX, pageHeight - 10, { align: 'center' })
    if (appSettings.footerText) {
      doc.text(appSettings.footerText, 15, pageHeight - 10)
    }
    doc.text(`Lampiran Lampiran Regulasi - ${getRevenueLabel(revenueType)}`, pageWidth - 15, pageHeight - 10, { align: 'right' })
  }

  const pdfOutput = doc.output('arraybuffer')

  const revTag = revenueType === 'bpjs' ? '_BPJS' : revenueType === 'umum' ? '_UMUM' : ''
  return new NextResponse(pdfOutput, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="KPI_Config_${unit.code}${revTag}_${new Date().toISOString().split('T')[0]}.pdf"`
    }
  })
}

function generateExcelReport(unit: any, categories: any[], appSettings: any, revenueType: string) {
  const workbook = XLSX.utils.book_new()

  const getRevenueLabel = (type: string) => {
    if (type === 'bpjs') return 'SKEMA BPJS KESEHATAN'
    if (type === 'umum') return 'SKEMA PENDAPATAN UMUM'
    return 'SKEMA GABUNGAN (BPJS & UMUM)'
  }

  // Summary Sheet
  const summaryData = [
    ['LAPORAN STRUKTUR & SPESIFIKASI KPI UNIT'],
    ['Unit Kerja:', `${unit.code} - ${unit.name}`],
    ['Jenis Pendapatan:', getRevenueLabel(revenueType)],
    ['Skema Unit:', (unit.kpi_schema_mode as string) === 'different' ? 'KPI Berbeda per Revenue' : 'KPI Sama untuk Semua Revenue'],
    ['Tanggal Cetak:', new Date().toLocaleDateString('id-ID')],
    ['Aplikasi:', appSettings.appName || 'JASPEL'],
    [],
    ['RINGKASAN STRUKTUR KATEGORI KPI'],
    ['Kategori', 'Jenis Revenue', 'Bobot (%)', 'Jumlah Indikator', 'Jumlah Sub Indikator'],
  ]

  let totalCategories = 0
  let totalIndicators = 0
  let totalSubIndicators = 0
  let totalCategoryWeight = 0

  categories.forEach(cat => {
    const indicators = cat.m_kpi_indicators || []
    const subIndicatorCount = indicators.reduce((sum: number, ind: any) =>
      sum + (ind.m_kpi_sub_indicators?.length || 0), 0)

    summaryData.push([
      `${cat.category} - ${cat.category_name}`,
      cat.revenue_type === 'umum' ? 'PENDAPATAN UMUM' : cat.revenue_type === 'bpjs' ? 'BPJS KESEHATAN' : 'SEMUA',
      cat.weight_percentage.toString(),
      indicators.length.toString(),
      subIndicatorCount.toString()
    ])

    totalCategories++
    totalIndicators += indicators.length
    totalSubIndicators += subIndicatorCount
    totalCategoryWeight += Number(cat.weight_percentage)
  })

  summaryData.push(
    ['TOTAL', '', totalCategoryWeight.toString(), totalIndicators.toString(), totalSubIndicators.toString()]
  )

  summaryData.push(
    [],
    ['Validasi Bobot Kategori:', totalCategoryWeight === 100 ? 'VALID ✓ (Sesuai Regulasi 100%)' : `PERLU PENYESUAIAN (${totalCategoryWeight}%)`],
    []
  )

  // Add footer information if available
  if (appSettings.organizationName) {
    summaryData.push(['Organisasi:', appSettings.organizationName])
  }
  if (appSettings.developerName) {
    summaryData.push(['Dikembangkan oleh:', appSettings.developerName])
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan')

  // Detail sheets for each category
  categories.forEach(category => {
    const catRevTag = category.revenue_type === 'umum' ? '[UMUM]' : category.revenue_type === 'bpjs' ? '[BPJS]' : '[ALL]'
    const categoryData = [
      [`KATEGORI ${category.category}: ${category.category_name} ${catRevTag}`],
      ['Jenis Pendapatan:', category.revenue_type === 'umum' ? 'PENDAPATAN UMUM' : category.revenue_type === 'bpjs' ? 'BPJS KESEHATAN' : 'SEMUA REVENUE'],
      ['Bobot Kategori:', `${category.weight_percentage}%`],
      ['Deskripsi:', category.description || '-'],
      [],
      ['INDIKATOR DAN SUB INDIKATOR'],
      []
    ]

    const indicators = category.m_kpi_indicators || []
    let totalIndicatorWeight = 0

    indicators.forEach((indicator: any) => {
      totalIndicatorWeight += Number(indicator.weight_percentage)

      categoryData.push([
        'INDIKATOR:',
        indicator.code,
        indicator.name,
        `Bobot: ${indicator.weight_percentage}%`,
        `Target: ${indicator.target_value || 0}`,
        `Satuan: ${indicator.measurement_unit || '-'}`,
        `Tarif Dasar: ${indicator.base_index_value || '-'}`
      ])

      if (indicator.description) {
        categoryData.push(['Deskripsi:', indicator.description])
      }

      // Add sub indicators
      const subIndicators = indicator.m_kpi_sub_indicators || []
      if (subIndicators.length > 0) {
        categoryData.push([])
        categoryData.push(['SUB INDIKATOR:', 'Kode', 'Nama', 'Bobot (%)', 'Target', 'Satuan', 'Tarif Dasar', 'Kriteria Penilaian'])

        let totalSubWeight = 0
        subIndicators.forEach((sub: any) => {
          totalSubWeight += Number(sub.weight_percentage)

          let criteriaText = '-'
          if (sub.scoring_criteria && Array.isArray(sub.scoring_criteria)) {
            criteriaText = sub.scoring_criteria.map((criteria: any) =>
              `Skor ${criteria.score || '-'}: ${criteria.label || ''}`
            ).join('; ')
          }

          categoryData.push([
            '',
            sub.code,
            sub.name,
            sub.weight_percentage,
            sub.target_value || 0,
            sub.measurement_unit || '-',
            sub.base_index_value || '-',
            criteriaText
          ])
        })

        categoryData.push(['Total Bobot Sub Indikator:', `${totalSubWeight}%`, totalSubWeight === 100 ? 'VALID ✓' : 'PERLU PENYESUAIAN'])
        categoryData.push([])
      }

      categoryData.push([])
    })

    categoryData.push(['VALIDASI BOBOT INDIKATOR'])
    categoryData.push(['Total Bobot Indikator:', `${totalIndicatorWeight}%`])
    categoryData.push(['Status:', totalIndicatorWeight === 100 ? 'VALID ✓' : `PERLU PENYESUAIAN (harus 100%)`])

    const sheetName = `${category.category}_${category.revenue_type || 'all'}`.substring(0, 31)
    const categorySheet = XLSX.utils.aoa_to_sheet(categoryData)
    XLSX.utils.book_append_sheet(workbook, categorySheet, sheetName)
  })

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  const revTag = revenueType === 'bpjs' ? '_BPJS' : revenueType === 'umum' ? '_UMUM' : ''
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Laporan_KPI_${unit.code}${revTag}_${new Date().toISOString().split('T')[0]}.xlsx"`
    }
  })
}

