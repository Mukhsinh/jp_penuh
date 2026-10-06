import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createAdminClient } from '../supabase/server'
import { formatCurrency, formatDecimal, formatDate } from '../utils/format'

export async function generateSystemGuide(unitId?: string, revenueType: string = 'all'): Promise<Buffer> {
  const adminClient = await createAdminClient()

  // Get settings for Kop Surat & App Info
  const { data: settingsData } = await adminClient
    .from('t_settings')
    .select('key, value')
    .in('key', ['company_info', 'footer'])

  let logoBase64: string | null = null
  let appSettings = {
    appName: 'JASPEL',
    organizationName: 'RUMAH SAKIT SUNGAI BAHAR',
    address: 'Kabupaten Muaro Jambi, Provinsi Jambi',
    email: 'admin@sungaipenuh.com',
    footerText: '',
    logo: ''
  }

  if (settingsData) {
    const companyInfo = (settingsData.find(s => s.key === 'company_info')?.value as any) || {}
    const footerInfo = (settingsData.find(s => s.key === 'footer')?.value as any) || {}
    appSettings.appName = companyInfo.appName || appSettings.appName
    appSettings.organizationName = companyInfo.name || appSettings.organizationName
    appSettings.address = companyInfo.address || appSettings.address
    appSettings.email = companyInfo.email || appSettings.email
    appSettings.footerText = typeof footerInfo === 'string' ? footerInfo : (footerInfo.text || '')
    appSettings.logo = companyInfo.logo || ''
  }

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
        console.error('Error fetching logo for PDF:', e)
      }
    }
  }

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const centerX = pageWidth / 2

  const getRevenueLabel = (type: string) => {
    if (type === 'bpjs') return 'PENDAPATAN BPJS KESEHATAN'
    if (type === 'umum') return 'PENDAPATAN UMUM'
    return 'GABUNGAN (BPJS & UMUM)'
  }

  // Draw Kop Surat Header
  const drawKopSurat = () => {
    if (logoBase64) {
      try {
        const format = logoBase64.includes('image/png') ? 'PNG' : 'JPEG'
        doc.addImage(logoBase64, format, 15, 9, 22, 22)
      } catch (err) {
        console.error('Failed to draw logo on PDF:', err)
      }
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('PEMERINTAH KABUPATEN MUARO JAMBI', centerX, 14, { align: 'center' })

    doc.setFontSize(15)
    doc.text(appSettings.organizationName.toUpperCase(), centerX, 21, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(appSettings.address, centerX, 26, { align: 'center' })
    doc.text(`Email: ${appSettings.email} | Sistem Informasi JASPEL & KPI`, centerX, 31, { align: 'center' })

    doc.setDrawColor(15, 23, 42)
    doc.setLineWidth(0.8)
    doc.line(15, 35, pageWidth - 15, 35)
    doc.setLineWidth(0.2)
    doc.line(15, 36.5, pageWidth - 15, 36.5)
  }

  drawKopSurat()

  if (!unitId) {
    // General System Guide
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('PEDOMAN KPI SISTEM (JASPEL)', centerX, 45, { align: 'center' })

    // Revenue Subtitle Tag
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 58, 138)
    doc.text(`[ VERSI REGULASI: ${getRevenueLabel(revenueType)} ]`, centerX, 51, { align: 'center' })

    let currentY = 60

    // Intro Card Box
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(15, currentY, pageWidth - 30, 24, 2, 2, 'FD')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('RINGKASAN REGULASI SISTEM JASPEL & KPI:', 20, currentY + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const introLines = [
      'Dokumen ini merupakan Petunjuk Teknis Resmi pengoperasian dan pembobotan Indikator Kinerja Utama (KPI).',
      'Setiap pegawai diukur berdasarkan pencapaian target individual dan kolektif unit untuk menentukan distribusi Jasa Pelayanan.'
    ]
    introLines.forEach((line, idx) => {
      doc.text(line, 20, currentY + 12 + (idx * 5))
    })

    currentY += 32

    // Section 1: Kategori KPI
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('1. STRUKTUR KATEGORI PENILAIAN (P1, P2, P3)', 15, currentY)
    currentY += 6

    const categoryData = [
      ['Kategori P1 (Kinerja Utama)', 'Mengukur output layanan langsung / kegiatan medis & non-medis pokok sesuai tupoksi unit.'],
      ['Kategori P2 (Kinerja Tambahan)', 'Mengukur kontribusi administrasi, pelaporan, tugas tambahan, dan manajemen operasional.'],
      ['Kategori P3 (Perilaku & Absensi)', 'Mengukur kedisiplinan kehadiran (absensi) dan perilaku kerja bulanan pegawai.']
    ]

    autoTable(doc, {
      startY: currentY,
      head: [['Komponen Kategori', 'Deskripsi Penilaian']],
      body: categoryData,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: 'bold' },
        1: { cellWidth: 'auto' }
      },
      margin: { left: 15, right: 15 }
    })

    currentY = (doc as any).lastAutoTable.finalY + 10

    // Section 2: Dual Revenue Distinction
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('2. ATURAN PENETAPAN SKEMA DUAL REVENUE (BPJS VS UMUM)', 15, currentY)
    currentY += 6

    const revRulesData = [
      ['Skema KPI Sama', 'Unit menggunakan indikator dan bobot yang identik baik untuk klaim BPJS Kesehatan maupun Pasien UMUM.'],
      ['Skema KPI Berbeda', 'Unit memiliki indikator/bobot khusus yang dipisahkan antara pelayanan BPJS Kesehatan dan Pendapatan UMUM.'],
      ['Penilaian Independen', 'Capaian skor disimpulkan secara mandiri per alokasi pool pendapatan sesuai regulasi keuangan unit.']
    ]

    autoTable(doc, {
      startY: currentY,
      head: [['Model Pengoperasian', 'Ketentuan Pengaplikasian']],
      body: revRulesData,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: 'bold' },
        1: { cellWidth: 'auto' }
      },
      margin: { left: 15, right: 15 }
    })

    currentY = (doc as any).lastAutoTable.finalY + 10

    // Section 3: Signature Block
    if (currentY > pageHeight - 65) {
      doc.addPage()
      drawKopSurat()
      currentY = 45
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('LEMBAR PENGESAHAN PETUNJUK TEKNIS REGULASI', 15, currentY)
    currentY += 8

    const signY = currentY
    const col1X = 25
    const col2X = pageWidth - 75

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Mengetahui / Penanggung Jawab,', col1X, signY)
    doc.text('Disetujui Oleh,', col2X, signY)

    doc.text('Kepala Unit Kerja / Tim KPI', col1X, signY + 5)
    doc.text('Direktur / Management RSUD', col2X, signY + 5)

    doc.line(col1X, signY + 28, col1X + 50, signY + 28)
    doc.text('NIP. .....................................', col1X, signY + 33)

    doc.line(col2X, signY + 28, col2X + 50, signY + 28)
    doc.text('NIP. .....................................', col2X, signY + 33)

  } else {
    // Unit Specific Guide/Config
    const { data: unit } = await adminClient
      .from('m_units')
      .select('code, name, kpi_schema_mode')
      .eq('id', unitId)
      .single()

    if (unit) {
      const isDiffMode = (unit.kpi_schema_mode as string) === 'different'

      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text('PEDOMAN KPI UNIT', centerX, 44, { align: 'center' })

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 58, 138)
      doc.text(`[ ${getRevenueLabel(revenueType)} ]`, centerX, 50, { align: 'center' })

      let currentY = 56

      // Unit Metadata (Tanpa Frame Box)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)

      doc.text(`Unit Kerja`, 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${unit.code} - ${unit.name}`, 55, currentY)
      currentY += 5.5

      doc.setFont('helvetica', 'bold')
      doc.text(`Skema Penggunaan`, 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${isDiffMode ? 'KPI Berbeda per Jenis Pendapatan (BPJS vs UMUM)' : 'KPI Sama untuk Semua Jenis Pendapatan'}`, 55, currentY)
      currentY += 5.5

      doc.setFont('helvetica', 'bold')
      doc.text(`Versi Pendapatan`, 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${getRevenueLabel(revenueType)}`, 55, currentY)
      currentY += 5.5

      doc.setFont('helvetica', 'bold')
      doc.text(`Tanggal Penetapan`, 15, currentY); doc.setFont('helvetica', 'normal'); doc.text(`: ${formatDate(new Date())}`, 55, currentY)

      currentY += 10

      const allowedRevenueTypes = revenueType === 'all' ? ['all', 'bpjs', 'umum'] : [revenueType, 'all']

      // Query categories for this unit
      let categoriesQuery = adminClient
        .from('m_kpi_categories')
        .select('*')
        .eq('unit_id', unitId)
        .eq('is_active', true)

      if (revenueType !== 'all') {
        categoriesQuery = categoriesQuery.or(`revenue_type.in.(${allowedRevenueTypes.join(',')}),revenue_type.is.null`)
      }

      const { data: categories } = await categoriesQuery.order('category')

      let grandTotalIndicators = 0
      let grandTotalSubIndicators = 0
      let grandTotalWeight = 0

      for (const cat of categories || []) {
        const catRevBadge = cat.revenue_type === 'umum'
          ? '[PENDAPATAN UMUM]'
          : cat.revenue_type === 'bpjs'
            ? '[BPJS KESEHATAN]'
            : '[SEMUA REVENUE]'

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(15, 23, 42)
        const bobotText = cat.is_weighted !== false ? `(Bobot: ${cat.weight_percentage || 0}%)` : '(Tanpa Bobot)'
        doc.text(`KATEGORI ${cat.category}: ${cat.category_name} ${bobotText}  ${isDiffMode ? catRevBadge : ''}`, 15, currentY)
        currentY += 6

        grandTotalWeight += Number(cat.weight_percentage || 0)

        const { data: indicators } = await adminClient
          .from('m_kpi_indicators')
          .select('*')
          .eq('category_id', cat.id)
          .eq('is_active', true)
          .order('code')

        const tableBody: any[] = []

        for (const ind of indicators || []) {
          grandTotalIndicators++

          let indAdditionalInfo = ''
          if (ind.base_index_value && Number(ind.base_index_value) > 0) {
            const formatted = Number(ind.base_index_value) >= 1000 ? formatCurrency(ind.base_index_value) : formatDecimal(ind.base_index_value, 4)
            indAdditionalInfo = `\nTarif Dasar / Indeks: ${formatted}`
          }

          tableBody.push([
            { content: ind.code, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } as any },
            { content: ind.name + indAdditionalInfo, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } as any },
            { content: ind.calculation_method === 'priority' ? 'Prioritas' : `${ind.weight_percentage || 0}%`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } as any },
            { content: ind.calculation_method === 'priority' ? 'Metode Prioritas (Direct Payout)' : 'Metode Indeksasi (PIR)', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } as any }
          ])

          const { data: subs } = await adminClient
            .from('m_kpi_sub_indicators')
            .select('*')
            .eq('indicator_id', ind.id)
            .eq('is_active', true)
            .order('code')

          for (const sub of subs || []) {
            grandTotalSubIndicators++
            let criteriaText = '-'

            if (sub.measurement_type === 'quantitative') {
              const formattedSub = Number(sub.base_index_value || 0) >= 1000
                ? formatCurrency(sub.base_index_value || 0)
                : formatDecimal(sub.base_index_value || 0, 4)
              criteriaText = `Kuantitatif | Tarif Dasar: ${formattedSub}`
            } else if (sub.scoring_criteria && Array.isArray(sub.scoring_criteria) && sub.scoring_criteria.length > 0) {
              criteriaText = sub.scoring_criteria
                .map((c: any) => `• ${c.label || ''} (Skor: ${c.score ?? '-'})`)
                .join('\n')
            }

            tableBody.push([
              { content: `   ${sub.code}`, styles: { fontStyle: 'normal' } },
              { content: sub.name + (sub.description ? `\n(${sub.description})` : '') },
              { content: `${sub.weight_percentage || 0}%`, styles: { halign: 'center' } },
              { content: criteriaText }
            ])
          }
        }

        autoTable(doc, {
          startY: currentY,
          head: [['Kode', 'Indikator / Sub-Indikator', 'Bobot', 'Kriteria Penilaian / Indeks']],
          body: tableBody,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2.5, valign: 'middle' },
          headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 75 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 'auto' }
          },
          margin: { left: 15, right: 15 }
        })

        currentY = (doc as any).lastAutoTable.finalY + 10
        if (currentY > pageHeight - 50) {
          doc.addPage()
          drawKopSurat()
          currentY = 45
        }
      }

      // Signature Block
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
    }
  }

  // Footer for all pages
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
    doc.text(`Dokumen Lampiran Regulasi JASPEL - ${getRevenueLabel(revenueType)}`, pageWidth - 15, pageHeight - 10, { align: 'right' })
  }

  return Buffer.from(doc.output('arraybuffer'))
}

