import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getCompanyInfoServer, getSettingServer } from '@/lib/services/settings.server.service'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/format'

interface IncentiveSlipData {
  period: string
  employeeCode: string
  nik?: string
  employeeName: string
  unit: string
  taxStatus: string
  employeeStatus?: string
  taxType?: string
  bankName?: string
  bankAccountNumber?: string
  bankAccountHolder?: string
  p1Score: number
  p2Score: number
  p3Score: number
  p1Weight: number
  p2Weight: number
  p3Weight: number
  p1Weighted: number
  p2Weighted: number
  p3Weighted: number
  finalScore: number
  pirValue: number
  totalSkorUnit: number
  unitProportion: number | string
  unitAllocation?: number
  unitTotalActivity?: number
  totalActivityRupiah: number
  grossIncentive: number
  taxAmount: number
  netIncentive: number
  tax_mechanism_used?: string
  ikg_score?: number
  allocated_pool?: number
  adjustment_value?: number
  attendance_deduction?: number
  other_deductions?: number
  index_incentive?: number
  guarantee_fee?: number
  tax_detail?: string
  pnsGrade?: string
  potongan?: number
  distribusi_potongan?: number
  assessment_details?: any[]
}

function checkPageBreak(doc: any, yPos: number, neededHeight: number) {
  if (yPos + neededHeight > doc.internal.pageSize.height - 20) {
    doc.addPage()
    return 20 // Return new Y position
  }
  return yPos
}

function formatScore(val: number | string | undefined | null, decimals: number = 2): string {
  const num = typeof val === 'string' ? parseFloat(val) : (val || 0)
  if (isNaN(num)) return '0,00'
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

interface ReportExportOptions {
  reportType: string
  period: string
  data: any[]
  revenueType?: string
}

/**
 * Helper to add professional Kop Surat (Header) to PDF
 */
async function addKopSurat(doc: jsPDF, companyInfo: any) {
  // Add logo if exists
  if (companyInfo.logo) {
    try {
      // Image support (base64 or URL)
      if (companyInfo.logo.startsWith('data:image')) {
        doc.addImage(companyInfo.logo, 'PNG', 15, 8, 22, 22)
      } else if (companyInfo.logo.startsWith('http')) {
        const imgRes = await fetch(companyInfo.logo);
        const arrayBuffer = await imgRes.arrayBuffer();
        let format = 'PNG';
        if (companyInfo.logo.toLowerCase().includes('.jpg') || companyInfo.logo.toLowerCase().includes('.jpeg')) {
          format = 'JPEG';
        }
        doc.addImage(new Uint8Array(arrayBuffer) as any, format, 15, 8, 22, 22)
      }
    } catch (e) {
      console.error('Error adding logo to PDF:', e)
    }
  }

  const centerX = doc.internal.pageSize.width / 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(companyInfo.name || 'JASPEL ENTERPRISE', centerX, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(companyInfo.address || 'Jakarta, Indonesia', centerX, 22, { align: 'center' })

  if (companyInfo.phone || companyInfo.email) {
    const contact = [companyInfo.phone, companyInfo.email].filter(Boolean).join(' | ')
    doc.setFontSize(8)
    doc.text(contact, centerX, 27, { align: 'center' })
  }

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(15, 32, doc.internal.pageSize.width - 15, 32)
  doc.setLineWidth(0.2)
  doc.line(15, 33, doc.internal.pageSize.width - 15, 33)
}

/**
 * Generate incentive slip PDF
 */
export async function generateIncentiveSlipPDF(data: IncentiveSlipData | IncentiveSlipData[], revenueType?: string): Promise<Uint8Array> {
  const doc = new jsPDF()
  const companyInfo = await getCompanyInfoServer()
  const footerSetting = await getSettingServer('footer')
  const footerText = footerSetting?.data?.text || 'Laporan dihasilkan secara otomatis oleh JASPEL System'

  const items = Array.isArray(data) ? data : [data]

  for (let i = 0; i < items.length; i++) {
    const slip = items[i]
    if (i > 0) doc.addPage()

    await addKopSurat(doc, companyInfo)

    // Formatting helper
    const formatCurrency = (num: number) =>
      new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num)

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('SLIP INSENTIF KINERJA (JASPEL)', 105, 42, { align: 'center' })

    // Employee Info
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')

    // Left column
    doc.setFont('helvetica', 'bold')
    doc.text('INFORMASI PEGAWAI:', 15, 50)
    doc.setFont('helvetica', 'normal')
    doc.text(`Periode`, 17, 56); doc.text(`: ${slip.period || '-'}`, 50, 56)
    doc.text(`Nama`, 17, 61); doc.text(`: ${slip.employeeName}`, 50, 61)
    doc.text(`NIP/NIK`, 17, 66); doc.text(`: ${slip.employeeCode}`, 50, 66)
    doc.text(`NIK`, 17, 71); doc.text(`: ${slip.nik || '-'}`, 50, 71)
    doc.text(`Unit`, 17, 76); doc.text(`: ${slip.unit}`, 50, 76)
    doc.text(`Status`, 17, 81); doc.text(`: ${slip.employeeStatus || '-'}`, 50, 81)
    const displayGrade = (slip.pnsGrade && slip.pnsGrade !== '-' && slip.pnsGrade !== 'null') ? slip.pnsGrade : '-'
    doc.text(`Golongan`, 17, 86); doc.text(`: ${displayGrade}`, 50, 86)

    // Right column (Bank Details)
    const rightX = 115
    doc.setFont('helvetica', 'bold')
    doc.text('INFORMASI PEMBAYARAN:', rightX, 50)
    doc.setFont('helvetica', 'normal')
    doc.text(`Nama Bank`, rightX + 2, 56); doc.text(`: ${slip.bankName || '-'}`, rightX + 35, 56)
    doc.text(`No. Rekening`, rightX + 2, 61); doc.text(`: ${slip.bankAccountNumber || '-'}`, rightX + 35, 61)
    doc.text(`Nama Pemilik`, rightX + 2, 66); doc.text(`: ${slip.bankAccountHolder || '-'}`, rightX + 35, 66)

    if (revenueType) {
      const revLabel = revenueType === 'bpjs' ? 'BPJS Kesehatan' : revenueType === 'umum' ? 'Pendapatan UMUM' : 'Konsolidasi (BPJS & UMUM)'
      doc.text(`Jenis Pendapatan`, rightX + 2, 71); doc.text(`: ${revLabel}`, rightX + 35, 71)
    }

    // Summary Table - use dynamic weights from KPI config
    const p1w = slip.p1Weight || 0
    const p2w = slip.p2Weight || 0
    const p3w = slip.p3Weight || 0

    autoTable(doc, {
      startY: 92,
      head: [['Komponen Penilaian', 'Skor', 'Bobot (%)', 'Nilai Tertimbang']],
      body: [
        ['P1 (Kinerja Utama/Posisi)', formatScore(slip.p1Score), `${formatScore(p1w)}%`, formatScore(slip.p1Weighted)],
        ['P2 (Kinerja Tambahan)', formatScore(slip.p2Score), `${formatScore(p2w)}%`, formatScore(slip.p2Weighted)],
        ['P3 (Perilaku/Potensi)', formatScore(slip.p3Score), `${formatScore(p3w)}%`, formatScore(slip.p3Weighted)],
        [{ content: 'Total Skor Akhir', styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }, '-', '-', { content: formatScore(slip.finalScore), styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }],
      ],
      theme: 'grid',
      headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 }
    })

    // === RINCIAN INDIKATOR PENILAIAN ===
    if (slip.assessment_details && slip.assessment_details.length > 0) {
      let currentY = (doc as any).lastAutoTable.finalY + 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('B. RINCIAN INDIKATOR PENILAIAN', 15, currentY)
      currentY += 4

      autoTable(doc, {
        startY: currentY,
        head: [['No', 'Kategori', 'Indikator', 'Realisasi', 'Skor', 'Status']],
        body: slip.assessment_details.map((d: any, idx: number) => {
          const statusMarker = d.is_priority ? '[PR]' : '[IX]'
          const realizationDisplay = d.is_activity ? `${d.realization}` : `${d.realization}%`
          // If it's activity indexing (non-priority but has value), score is activity_value
          // Otherwise it's the raw score
          const scoreDisplay = (d.is_activity && !d.is_priority) ?
            new Intl.NumberFormat('id-ID').format(Math.round(d.activity_value || 0)) :
            formatScore(d.score)

          return [
            idx + 1,
            d.category,
            d.name,
            realizationDisplay,
            scoreDisplay,
            { content: statusMarker, styles: { fontStyle: 'bold', textColor: d.is_priority ? [239, 68, 68] : [37, 99, 235] } }
          ]
        }),
        theme: 'striped',
        headStyles: { fillColor: [52, 73, 94], textColor: 255, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 25 },
          3: { halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'center' }
        }
      })

      // AutoTable updates lastAutoTable.finalY
      let noteY = (doc as any).lastAutoTable.finalY + 5

      if (slip.potongan && slip.potongan > 0) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(239, 68, 68) // Red
        doc.text(`* Keterangan: Terdapat Potongan Indikator/Denda sebesar ${formatCurrency(slip.potongan)} pada periode ini.`, 15, noteY)
        noteY += 4
      }

      if (slip.distribusi_potongan && slip.distribusi_potongan > 0) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(5, 150, 105) // Emerald
        doc.text(`* Keterangan: Mendapatkan tambahan Insentif (Distribusi Potongan Unit) sebesar ${formatCurrency(slip.distribusi_potongan)}.`, 15, noteY)
        noteY += 4
      }

      doc.setTextColor(0, 0, 0) // Reset color
    }

    // === RINCIAN PIR (Poin Indeks Rupiah) ===
    let yPos = (doc as any).lastAutoTable.finalY + 8
    doc.setDrawColor(200, 200, 200)
    doc.line(15, yPos - 3, doc.internal.pageSize.width - 15, yPos - 3)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('C. PERHITUNGAN PIR (Poin Indeks Rupiah)', 15, yPos + 1)

    doc.setFont('helvetica', 'normal')
    doc.setFont('helvetica', 'normal')

    const mechanism = slip.tax_mechanism_used || 'ter'
    const isNoTax = mechanism === 'none'

    // Header logic for "Tanpa Pajak"
    const incentiveLabel = isNoTax ? "Insentif Bruto (Sebelum Pajak)" : "Insentif Bruto"

    doc.setFontSize(9)
    const fmtNum = (val: number) => Math.round(val).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

    const allocatedForUnit = typeof slip.unitAllocation === 'number' ? slip.unitAllocation : 0;
    const unitActivity = typeof slip.unitTotalActivity === 'number' ? slip.unitTotalActivity : 0;
    const remainingForIndex = allocatedForUnit - unitActivity;
    const pirValue = typeof slip.pirValue === 'number' ? slip.pirValue : 0;
    const totalSkorUnit = typeof slip.totalSkorUnit === 'number' ? slip.totalSkorUnit : 0;

    yPos += 7
    doc.text(`Formula: PIR = ((Alokasi Dana Unit) - (Insentif Kuantitatif Unit)) / Total Skor Seluruh Pegawai di Unit`, 15, yPos)
    yPos += 5
    doc.text(`Proporsi Unit ${slip.unit}`, 20, yPos)

    // Check if it's already a formatted string 
    const propDisplay = typeof slip.unitProportion === 'string' && slip.unitProportion.includes('%')
      ? slip.unitProportion
      : `${Number(slip.unitProportion || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

    doc.text(`: ${propDisplay}`, 95, yPos)
    yPos += 5
    doc.text(`Alokasi Dana Unit (Awal)`, 20, yPos)
    doc.text(`: Rp ${fmtNum(allocatedForUnit)}`, 95, yPos)
    yPos += 5
    doc.text(`Pengurang Kuantitatif Unit`, 20, yPos)
    doc.text(`: Rp ${fmtNum(unitActivity)}`, 95, yPos)
    yPos += 5
    doc.text(`Sisa Alokasi untuk Skor Indeks`, 20, yPos)
    doc.text(`: Rp ${fmtNum(remainingForIndex)}`, 95, yPos)
    yPos += 5
    doc.text(`Total Skor Kolektif Unit`, 20, yPos)
    doc.text(`: ${formatScore(totalSkorUnit)}`, 95, yPos)
    yPos += 5
    doc.text(`Nilai PIR`, 20, yPos)
    doc.text(`: Rp ${formatScore(pirValue)}`, 95, yPos)
    yPos += 3

    // === PERHITUNGAN INSENTIF ===
    yPos = checkPageBreak(doc, yPos, 120)
    yPos += 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('PERHITUNGAN INSENTIF', 105, yPos, { align: 'center' })
    yPos += 10

    const tableRows: any[] = []
    tableRows.push(['A.', incentiveLabel, ''])
    tableRows.push(['', '1. Insentif Berbasis Indeks (Total Skor × PIR)', formatCurrency(slip.index_incentive || 0)])
    tableRows.push(['', '2. Insentif Berbasis Prioritas (Direct Payout)', formatCurrency(slip.totalActivityRupiah || 0)])

    let nextNum = 3
    if (slip.guarantee_fee && slip.guarantee_fee > 0) {
      tableRows.push(['', `${nextNum}. Guarantee Fee`, formatCurrency(slip.guarantee_fee || 0)])
      nextNum++
    }
    if (slip.distribusi_potongan && slip.distribusi_potongan > 0) {
      tableRows.push(['', `${nextNum}. Tambahan Distribusi Potongan Unit`, `+ ${formatCurrency(slip.distribusi_potongan || 0)}`])
      nextNum++
    }
    if (slip.potongan && slip.potongan > 0) {
      tableRows.push(['', `${nextNum}. Potongan KPI / Denda`, `- ${formatCurrency(slip.potongan || 0)}`])
      nextNum++
    }
    tableRows.push(['', '   Total Insentif Bruto', formatCurrency(slip.grossIncentive || 0)])
    tableRows.push(['', '', ''])

    let taxLabel = 'POTONGAN PAJAK PPh 21'
    if (mechanism === 'none') {
      taxLabel = 'PAJAK PPh 21 (Tanpa Potongan Pajak)'
    } else if (mechanism === 'ter') {
      taxLabel = 'POTONGAN PAJAK PPh 21 (Mekanisme TER PP 58/2023)'
    } else if (mechanism === 'final_pp80') {
      taxLabel = 'POTONGAN PAJAK PPh 21 (Mekanisme Final PP 80/2010)'
    }

    tableRows.push(['B.', taxLabel, ''])
    tableRows.push(['', '1. PPh Pasal 21', formatCurrency(slip.taxAmount || 0)])
    if (slip.tax_detail && slip.tax_detail !== '-') {
      tableRows.push(['', `   (Detail: ${slip.tax_detail})`, ''])
    }
    tableRows.push(['', '', ''])

    tableRows.push(['C.', isNoTax ? 'TOTAL YANG DITERIMA (SEBELUM PAJAK)' : 'TOTAL INSENTIF NETTO (TAKE HOME PAY)', formatCurrency(slip.netIncentive || 0)])

    autoTable(doc, {
      startY: yPos,
      body: tableRows,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 120 }, 2: { cellWidth: 50, halign: 'right' } }
    })

  }

  // Add footer to every page
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(footerText, 105, pageHeight - 10, { align: 'center' })
    doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.width - 25, pageHeight - 10)
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/**
 * Generate summary report PDF
 */
export async function generateSummaryReportPDF(
  results: any[],
  period: string,
  reportType: string
): Promise<Uint8Array> {
  const doc = new jsPDF('landscape')
  const companyInfo = await getCompanyInfoServer()
  const footerSetting = await getSettingServer('footer')

  await addKopSurat(doc, companyInfo)

  const centerX = doc.internal.pageSize.width / 2

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')

  let title = `LAPORAN REKAPITULASI PEMBAYARAN JASPEL - PERIODE ${period}`
  if (reportType === 'kpi-achievement') title = `LAPORAN PENCAPAIAN KPI - PERIODE ${period}`
  if (reportType === 'unit-comparison') title = `LAPORAN PERBANDINGAN UNIT - PERIODE ${period}`

  doc.text(title, centerX, 42, { align: 'center' })

  let head = []
  let body = []

  if (reportType === 'kpi-achievement') {
    // Group results by employee_name
    const employeesData: Record<string, typeof results> = {}
    for (const r of results) {
      const empName = r.employee_name || 'Tidak Diketahui'
      if (!employeesData[empName]) employeesData[empName] = []
      employeesData[empName].push(r)
    }

    const employeeNames = Object.keys(employeesData).sort()

    for (let eIdx = 0; eIdx < employeeNames.length; eIdx++) {
      const empName = employeeNames[eIdx]
      const empResults = employeesData[empName]
      const empUnitName = empResults[0]?.unit_name || '-'

      if (eIdx > 0) {
        doc.addPage()
        // Re-add Kop Surat and title on each page for bulk reports
        await addKopSurat(doc, companyInfo)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(title, centerX, 42, { align: 'center' })
      }

      const indexResults = empResults.filter(r => !r.is_activity)
      const activityResults = empResults.filter(r => r.is_activity)

      let currentY = 60

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Pegawai: ${empName}  |  Unit: ${empUnitName}`, 15, 52);

      // --- TABLE 1: KATEGORI BERBASIS INDEKS ---
      if (indexResults.length > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('--- KATEGORI BERBASIS INDEKS ---', 15, currentY);
        currentY += 4;

        autoTable(doc, {
          startY: currentY,
          head: [['No', 'Kategori', 'Indikator', 'Target', 'Realisasi', 'Capaian (%)', 'Nilai', 'Gap']],
          body: indexResults.map((r, i) => [
            i + 1,
            r.category,
            r.indicator_name,
            r.target_value,
            r.realization_value,
            r.achievement_percentage,
            r.score,
            r.gap
          ]),
          theme: 'grid',
          headStyles: { fillColor: [44, 62, 80], textColor: 255 },
          styles: { fontSize: 8 },
          didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 7) {
              const gapVal = parseFloat(data.cell.raw as string);
              if (gapVal > 0) {
                data.cell.styles.textColor = [34, 197, 94];
                data.cell.styles.fontStyle = 'bold';
              } else if (gapVal < 0) {
                data.cell.styles.textColor = [239, 68, 68];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        })

        currentY = (doc as any).lastAutoTable.finalY + 10;

        // Recap Table for Index Scores
        let totalScore = 0;
        for (const r of indexResults) {
          totalScore += parseFloat(r.score || 0);
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Tabel Rekapitulasi Pencapaian (Indeks)', 15, currentY - 2);

        autoTable(doc, {
          startY: currentY,
          head: [['Komponen', 'Deskripsi', 'Total Nilai']],
          body: [
            ['Total Pencapaian', `Total Nilai dari Keseluruhan Indikator Berbasis Indeks`, totalScore.toFixed(2)],
          ],
          theme: 'grid',
          headStyles: { fillColor: [44, 62, 80], textColor: 255 },
          styles: { fontSize: 9 }
        })

        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // --- TABLE 2: KATEGORI BERBASIS AKTIVITAS ---
      if (activityResults.length > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('--- KATEGORI BERBASIS AKTIVITAS ---', 15, currentY);
        currentY += 4;

        autoTable(doc, {
          startY: currentY,
          head: [['No', 'Kategori', 'Indikator', 'Volume / Realisasi']],
          body: activityResults.map((r, i) => [
            i + 1,
            r.category,
            r.indicator_name,
            r.realization_value
          ]),
          theme: 'grid',
          headStyles: { fillColor: [44, 62, 80], textColor: 255 },
          styles: { fontSize: 8 }
        })
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }
    }

  } else if (reportType === 'unit-comparison') {
    head = [['No', 'Unit', 'Rata-Rata Skor', 'Total Insentif', 'Jumlah Pegawai']]
    body = results.map((r, i) => [
      i + 1,
      r.unit_name,
      formatScore(r.average_score),
      parseFloat(String(r.total_incentive)).toLocaleString('id-ID'),
      r.employee_count
    ])
    autoTable(doc, {
      startY: 50,
      head,
      body,
      theme: 'grid',
      headStyles: { fillColor: [44, 62, 80], textColor: 255 },
      styles: { fontSize: 8 }
    })
  } else {
    // Default to incentive
    head = [['No', 'NIP/NIK', 'Nama Pegawai', 'Unit', 'Proporsi Unit', 'P1', 'P2', 'P3', 'Total Indeks', 'Insentif Prioritas', 'PIR', 'Potongan', 'Distribusi Potongan', 'Insentif Bruto', 'Pajak', 'Netto']]
    body = results.map((r, i) => [
      i + 1,
      r.employee_code || '-',
      r.employee_name,
      r.unit,
      (typeof r.unit_proportion === 'string' && r.unit_proportion.includes('%')) ? r.unit_proportion : r.unit_proportion ? `${Number(r.unit_proportion).toFixed(2)}%` : '-',
      formatScore(r.p1_score),
      formatScore(r.p2_score),
      formatScore(r.p3_score),
      formatScore(r.total_score),
      Math.round(Number(r.total_priority_score || r.total_activity_rupiah || r.total_activity || 0)).toLocaleString('id-ID'),
      formatScore(r.pir_value),
      Math.round(Number(r.potongan) || 0).toLocaleString('id-ID'),
      Math.round(Number(r.distribusi_potongan) || 0).toLocaleString('id-ID'),
      Math.round(Number(r.gross_incentive) || 0).toLocaleString('id-ID'),
      Math.round(Number(r.tax_amount) || 0).toLocaleString('id-ID'),
      Math.round(Number(r.net_incentive) || 0).toLocaleString('id-ID')
    ])
    autoTable(doc, {
      startY: 50,
      head,
      body,
      theme: 'grid',
      headStyles: { fillColor: [44, 62, 80], textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 }
    })
  }

  // Add footer to every page
  const pageCount = (doc as any).internal.getNumberOfPages()
  const footerText = footerSetting?.data?.text || 'Laporan dihasilkan secara otomatis oleh JASPEL System'

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(footerText, centerX, pageHeight - 10, { align: 'center' })
    doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.width - 25, pageHeight - 10)
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/**
 * Export report to PDF
 */
export async function exportToPDF(options: ReportExportOptions): Promise<Uint8Array> {
  if (options.reportType === 'employee-slip') {
    const slips = options.data.map(item => {
      const parseNum = (val: any) => {
        if (typeof val === 'number') return val
        if (!val) return 0
        const strVal = String(val)
        if (strVal.includes(',')) {
          return parseFloat(strVal.replace(/\./g, '').replace(/,/g, '.')) || 0
        }
        return parseFloat(strVal) || 0
      }
      // Use actual weights from data, fallback to defaults
      const p1w = parseFloat(item.p1_weight) || 0
      const p2w = parseFloat(item.p2_weight) || 0
      const p3w = parseFloat(item.p3_weight) || 0

      return {
        period: options.period,
        employeeCode: item.employee_code || '-',
        nik: item.nik || '-',
        employeeName: item.employee_name,
        unit: item.unit,
        taxStatus: item.tax_status || 'Non-PKP',
        employeeStatus: item.employee_status || '-',
        taxType: item.tax_type || '-',
        bankName: item.bank_name,
        bankAccountNumber: item.bank_account_number,
        bankAccountHolder: item.bank_account_holder,
        p1Score: parseNum(item.p1_score),
        p2Score: parseNum(item.p2_score),
        p3Score: parseNum(item.p3_score),
        p1Weight: p1w,
        p2Weight: p2w,
        p3Weight: p3w,
        p1Weighted: parseNum(item.p1_weighted ?? item.p1_score),
        p2Weighted: parseNum(item.p2_weighted ?? item.p2_score),
        p3Weighted: parseNum(item.p3_weighted ?? item.p3_score),
        finalScore: parseNum(item.total_score),
        pirValue: parseNum(item.pir_value),
        totalSkorUnit: parseNum(item.total_skor_unit),
        unitProportion: typeof item.unit_proportion === 'string' && item.unit_proportion.includes('%')
          ? item.unit_proportion
          : parseNum(item.unit_proportion),
        unitAllocation: parseNum(item.unit_allocation),
        unitTotalActivity: parseNum(item.unit_total_activity),
        totalActivityRupiah: parseNum(item.total_activity_rupiah || item.total_activity),
        index_incentive: parseNum(item.index_incentive),
        guarantee_fee: parseNum(item.guarantee_fee),
        potongan: parseNum(item.potongan),
        distribusi_potongan: parseNum(item.distribusi_potongan),
        grossIncentive: parseNum(item.gross_incentive),
        taxAmount: parseNum(item.tax_amount),
        netIncentive: parseNum(item.net_incentive),
        tax_mechanism_used: item.tax_mechanism_used,
        tax_detail: item.tax_detail || '-',
        pnsGrade: item.pns_grade || '-',
        ikg_score: parseNum(item.ikg_score),
        allocated_pool: parseNum(item.allocated_pool),
        adjustment_value: parseNum(item.adjustment_value),
        attendance_deduction: parseNum(item.attendance_deduction),
        other_deductions: parseNum(item.other_deductions),
        assessment_details: (() => {
          const raw = item.assessment_details
          if (Array.isArray(raw)) return raw
          if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
          return []
        })()
      }
    })
    return await generateIncentiveSlipPDF(slips, options.revenueType)
  } else if (options.reportType === 'dashboard-summary') {
    return await generateDashboardReportPDF(options.data, options.period)
  } else if (options.reportType === 'user-list') {
    return await generateUserListPDF(options.data)
  } else if (options.reportType === 'system-overview') {
    return await generateSystemOverviewPDF()
  } else {
    return await generateSummaryReportPDF(options.data, options.period, options.reportType)
  }
}

/**
 * Generate Complete System Overview and User Manual PDF
 */
export async function generateSystemOverviewPDF(): Promise<Uint8Array> {
  const doc = new jsPDF()
  const companyInfo = await getCompanyInfoServer()
  const footerSetting = await getSettingServer('footer')
  const footerText = footerSetting?.data?.text || 'Laporan dihasilkan secara otomatis oleh JASPEL System'
  const appName = companyInfo.appName || 'PINTAR JP'
  const developerName = companyInfo.developerName || 'Mukhsin Hadi'

  const centerX = doc.internal.pageSize.width / 2
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height

  // === 1. COVER PAGE ===
  // Background/Border
  doc.setDrawColor(44, 62, 80)
  doc.setLineWidth(1)
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20)

  // Logo
  if (companyInfo.logo) {
    try {
      doc.addImage(companyInfo.logo, 'PNG', centerX - 25, 40, 50, 50)
    } catch (e) { console.error(e) }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(44, 62, 80)
  doc.text('LAPORAN GAMBARAN UMUM', centerX, 110, { align: 'center' })
  doc.text('& MANUAL PENGGUNAAN', centerX, 125, { align: 'center' })

  doc.setFontSize(22)
  doc.setTextColor(52, 73, 94)
  doc.text(`APLIKASI ${appName.toUpperCase()}`, centerX, 145, { align: 'center' })

  doc.setDrawColor(52, 73, 94)
  doc.setLineWidth(2)
  doc.line(centerX - 40, 155, centerX + 40, 155)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('Sistem Informasi Manajemen Kinerja Berbasis Jasa Pelayanan', centerX, 165, { align: 'center' })
  doc.text('dan Key Performance Indicators (KPI)', centerX, 172, { align: 'center' })

  // Footer Info on Cover
  doc.setFontSize(12)
  doc.setTextColor(44, 62, 80)
  doc.setFont('helvetica', 'bold')
  doc.text(companyInfo.name || 'Rumah Sakit Sungai Bahar', centerX, 230, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Dikembangkan Oleh: ${developerName}`, centerX, 250, { align: 'center' })
  doc.text(`Tahun 2026`, centerX, 258, { align: 'center' })

  // === 2. SISTEMATIKA / DAFTAR ISI ===
  doc.addPage()
  await addKopSurat(doc, companyInfo)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('DAFTAR ISI / SISTEMATIKA LAPORAN', 15, 45)

  const toc = [
    ['I.   PENDAHULUAN', 'Halaman 3'],
    ['II.  GAMBARAN UMUM SISTEM', 'Halaman 3'],
    ['III. MODUL DASHBOARD & VISUALISASI', 'Halaman 4'],
    ['IV.  MANAJEMEN PEGAWAI & UNIT KERJA', 'Halaman 4'],
    ['V.   KONFIGURASI KPI & INDIKATOR', 'Halaman 5'],
    ['VI.  PENILAIAN KINERJA (ASSESSMENT)', 'Halaman 5'],
    ['VII. MANAJEMEN DANA (POOL) & PENDAPATAN', 'Halaman 6'],
    ['VIII. LAPORAN & EKSPOR DATA', 'Halaman 6'],
    ['IX.  KESIMPULAN & PENUTUP', 'Halaman 7'],
  ]

  autoTable(doc, {
    startY: 55,
    body: toc,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }
    }
  })

  // === 3. CONTENT PAGE: PENDAHULUAN & GAMBARAN UMUM ===
  doc.addPage()
  await addKopSurat(doc, companyInfo)

  let y = 45
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('I. PENDAHULUAN', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const intro = `${appName} adalah sistem informasi enterprise yang dirancang khusus untuk mengelola Jasa Pelayanan (JASPEL) dan evaluasi kinerja berbasis Key Performance Indicators (KPI). Sistem ini bertujuan untuk meningkatkan transparansi, akurasi, dan efisiensi dalam distribusi insentif pegawai berdasarkan capaian kinerja yang terukur.`
  const splitIntro = doc.splitTextToSize(intro, pageWidth - 30)
  doc.text(splitIntro, 15, y); y += (splitIntro.length * 6) + 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('II. GAMBARAN UMUM SISTEM', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const overview = `Sistem ini mengintegrasikan data keuangan (pendapatan/revenue), data kepegawaian, dan instrumen penilaian kinerja. Dengan arsitektur modern berbasis Next.js dan Supabase, ${appName} mampu menangani perhitungan kompleks secara real-time dengan skalabilitas tinggi.`
  const splitOverview = doc.splitTextToSize(overview, pageWidth - 30)
  doc.text(splitOverview, 15, y); y += (splitOverview.length * 6) + 10

  const features = [
    ['Otomatisasi Kalkulasi', 'Menghitung insentif berdasarkan PIR (Poin Indeks Rupiah) secara otomatis.'],
    ['Fleksibilitas KPI', 'Konfigurasi indikator yang dapat disesuaikan untuk setiap unit kerja.'],
    ['Visualisasi Data', 'Grafik interaktif untuk memantau performa unit dan individu.'],
    ['Audit Trail', 'Pencatatan setiap perubahan data untuk keamanan dan akuntabilitas.']
  ]

  autoTable(doc, {
    startY: y,
    head: [['Fitur Unggulan', 'Deskripsi Keunggulan']],
    body: features,
    theme: 'striped',
    headStyles: { fillColor: [44, 62, 80] },
    styles: { fontSize: 10 }
  })

  // === 4. MODUL DASHBOARD & PEGAWAI ===
  doc.addPage()
  await addKopSurat(doc, companyInfo)
  y = 45

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('III. MODUL DASHBOARD & VISUALISASI', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const dashboardDesc = 'Dashboard menyediakan ringkasan eksekutif mengenai total realisasi pendapatan, alokasi jasa pelayanan, tingkat penyelesaian penilaian, hingga daftar pegawai dengan performa terbaik. Visualisasi menggunakan grafik tren untuk memudahkan pengambilan keputusan.'
  const splitDashboard = doc.splitTextToSize(dashboardDesc, pageWidth - 30)
  doc.text(splitDashboard, 15, y); y += (splitDashboard.length * 6) + 15

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('IV. MANAJEMEN PEGAWAI & UNIT KERJA', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const employeeDesc = 'Modul ini digunakan untuk mengelola data master pegawai, termasuk jabatan, golongan, dan unit penempatan. Sistem mendukung impor data massal dari Excel guna mempercepat proses input initial data.'
  const splitEmployee = doc.splitTextToSize(employeeDesc, pageWidth - 30)
  doc.text(splitEmployee, 15, y); y += (splitEmployee.length * 6) + 10

  // === 5. KPI & ASSESSMENT ===
  doc.addPage()
  await addKopSurat(doc, companyInfo)
  y = 45

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('V. KONFIGURASI KPI & INDIKATOR', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const kpiDesc = 'Setiap unit kerja memiliki standar penilaian yang berbeda. Modul ini memungkinkan administrator untuk mengatur kategori (P1, P2, P3), bobot indikator, dan target tahunan/bulanan secara spesifik per unit.'
  const splitKpi = doc.splitTextToSize(kpiDesc, pageWidth - 30)
  doc.text(splitKpi, 15, y); y += (splitKpi.length * 6) + 15

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('VI. PENILAIAN KINERJA (ASSESSMENT)', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const assessmentDesc = 'Proses penilaian dilakukan secara berkala. Atasan atau manajer unit menginput realisasi dari setiap indikator pegawai. Sistem secara otomatis menghitung skor akhir berdasarkan bobot yang telah ditetapkan.'
  const splitAssessment = doc.splitTextToSize(assessmentDesc, pageWidth - 30)
  doc.text(splitAssessment, 15, y); y += (splitAssessment.length * 6) + 10

  // === 6. POOL & REPORTS ===
  doc.addPage()
  await addKopSurat(doc, companyInfo)
  y = 45

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('VII. MANAJEMEN DANA (POOL) & PENDAPATAN', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const poolDesc = 'Modul manajemen dana digunakan untuk mencatat total pendapatan kotor, potongan operasional, hingga menghasilkan nilai Net Pool yang siap didistribusikan sebagai jasa pelayanan sesuai persentase alokasi global.'
  const splitPool = doc.splitTextToSize(poolDesc, pageWidth - 30)
  doc.text(splitPool, 15, y); y += (splitPool.length * 6) + 15

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('VIII. LAPORAN & EKSPOR DATA', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const reportDesc = 'Hasil akhir dari sistem adalah berbagai laporan profesional. Antara lain: Slip Insentif Individu, Rekapitulasi Per Unit, Laporan Pencapaian KPI, hingga Daftar Pengguna Sistem. Semua laporan dapat diunduh dalam format PDF dan Excel.'
  const splitReport = doc.splitTextToSize(reportDesc, pageWidth - 30)
  doc.text(splitReport, 15, y); y += (splitReport.length * 6) + 10

  // === 7. KESIMPULAN ===
  doc.addPage()
  await addKopSurat(doc, companyInfo)
  y = 45

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('IX. KESIMPULAN & PENUTUP', 15, y); y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const closing = `Dengan diterapkannya ${appName}, diharapkan manajemen Rumah Sakit Sungai Bahar dapat mengelola sumber daya manusia dan keuangan secara lebih profesional, transparan, dan berbasis kinerja nyata.`
  const splitClosing = doc.splitTextToSize(closing, pageWidth - 30)
  doc.text(splitClosing, 15, y); y += (splitClosing.length * 6) + 20

  // Signatures
  doc.setFont('helvetica', 'bold')
  doc.text('Tertanda,', pageWidth - 70, y)
  y += 25
  doc.text('( Mukhsin Hadi )', pageWidth - 70, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text('Lead Developer', pageWidth - 70, y)

  // Add footer to every page
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(150, 150, 150)
    doc.text(footerText, 105, pageHeight - 10, { align: 'center' })
    doc.text(`Dikembangkan oleh: ${developerName} | Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' })
  }

  return new Uint8Array(doc.output('arraybuffer'))
}


/**
 * Generate User List PDF
 */
export async function generateUserListPDF(users: any[]): Promise<Uint8Array> {
  const doc = new jsPDF()
  const companyInfo = await getCompanyInfoServer()
  const footerSetting = await getSettingServer('footer')
  const footerText = footerSetting?.data?.text || 'Laporan dihasilkan secara otomatis oleh JASPEL System'

  await addKopSurat(doc, companyInfo)

  const centerX = doc.internal.pageSize.width / 2

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('DAFTAR PENGGUNA SISTEM JASPEL', centerX, 42, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  doc.text(`Dicetak pada: ${dateStr}`, 15, 50)

  const head = [['No', 'Username', 'Nama Pegawai', 'Unit', 'Role', 'Password']]
  const body = users.map((u, i) => [
    i + 1,
    u.username || '-',
    u.display_name || u.full_name || '-',
    u.unit_name || '-',
    u.role_name || u.role || '-',
    '' // Blank space for writing password physically or later logic
  ])

  autoTable(doc, {
    startY: 55,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 52 },
      2: { cellWidth: 45 },
      3: { cellWidth: 35 },
      4: { cellWidth: 23 },
      5: { cellWidth: 20 }
    }
  })

  // Add footer to every page
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(footerText, centerX, pageHeight - 10, { align: 'center' })
    doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.width - 25, pageHeight - 10)
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/**
 * Generate Assessment Guide PDF
 */
export async function generateAssessmentGuidePDF(unitName: string = 'Seluruh Unit', unitId?: string | null): Promise<Uint8Array> {
  const doc = new jsPDF()
  const companyInfo = await getCompanyInfoServer()
  const footerSetting = await getSettingServer('footer')
  const footerText = footerSetting?.data?.text || 'Laporan dihasilkan secara otomatis oleh JASPEL System'

  await addKopSurat(doc, companyInfo)

  const centerX = doc.internal.pageSize.width / 2

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('PEDOMAN DAN PETUNJUK PENILAIAN KPI', centerX, 45, { align: 'center' })
  doc.setFontSize(12)
  doc.text(`UNIT KERJA: ${unitName.toUpperCase()}`, centerX, 52, { align: 'center' })

  // Current Y position after header
  let currentY = 65

  // Fetch KPI Configuration Data
  let categories: any[] = []
  if (unitId) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('m_kpi_categories')
      .select('*')
      .eq('unit_id', unitId)
      .order('category')
    categories = data || []
  }

  // 1. Overview Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('I. KOMPONEN DAN BOBOT PENILAIAN', 15, currentY)
  currentY += 5

  const componentsBody = categories.length > 0
    ? categories.map(cat => [
      `${cat.category} (${cat.category_name})`,
      `${cat.weight_percentage}%`,
      cat.description || '-'
    ])
    : [
      ['P1 (Utama)', '55%', 'Penilaian capaian indikator kinerja utama sesuai tupoksi/jabatan.'],
      ['P2 (Tambahan)', '25%', 'Penilaian aktivitas/tugas tambahan di luar tupoksi utama.'],
      ['P3 (Perilaku)', '20%', 'Penilaian sikap, kedisiplinan, kerja tim, dan potensi pengembangan.'],
    ]

  autoTable(doc, {
    startY: currentY,
    head: [['Komponen', 'Bobot', 'Deskripsi Penilaian']],
    body: componentsBody,
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 4 },
    margin: { left: 15, right: 15, bottom: 25 }
  })

  currentY = (doc as any).lastAutoTable.finalY + 12

  // 2. Calculation Section
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('II. STANDAR PENGHITUNGAN SKOR', 15, currentY)
  currentY += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('1. Rumus Skor Akhir Individu:', 15, currentY); currentY += 6

  const formula = categories.length > 0
    ? `Total Skor = ` + categories.map(cat => `(Skor ${cat.category} x ${cat.weight_percentage}%)`).join(' + ')
    : 'Total Skor = (Skor P1 x 55%) + (Skor P2 x 25%) + (Skor P3 x 20%)'

  doc.setFont('courier', 'bold')
  doc.text(`   ${formula}`, 15, currentY); currentY += 8

  doc.setFont('helvetica', 'normal')
  doc.text('2. Rumus Nilai Capaian Indikator:', 15, currentY); currentY += 6
  doc.setFont('courier', 'bold')
  doc.text('   Capaian = (Realisasi / Target) x 100%', 15, currentY); currentY += 5
  doc.text('   Nilai   = (Capaian x Bobot Indikator) / 100', 15, currentY); currentY += 12

  // 3. Detailed KPI Structure Section
  if (categories && categories.length > 0) {
    const supabase = await createClient()

    if (currentY > 220) {
      doc.addPage()
      currentY = 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('III. RINCIAN INDIKATOR DAN SUB-INDIKATOR KPI', 15, currentY)
    currentY += 5

    for (const cat of categories) {
      const { data: indicators } = await supabase
        .from('m_kpi_indicators')
        .select('*')
        .eq('category_id', cat.id)
        .order('code')

      if (!indicators || indicators.length === 0) continue

      // Check page break for category title
      if (currentY > 250) {
        doc.addPage()
        currentY = 20
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setFillColor(240, 240, 240)
      doc.rect(15, currentY, 180, 8, 'F')
      doc.text(`KATEGORI: ${cat.category} - ${cat.category_name}`, 18, currentY + 6)
      currentY += 12

      for (const ind of indicators) {
        const { data: subs } = await supabase
          .from('m_kpi_sub_indicators')
          .select('*')
          .eq('indicator_id', ind.id)
          .order('code')

        const bodyData = []

        // Add main indicator info
        bodyData.push([
          { content: `${ind.code}`, styles: { fontStyle: 'bold' as const } },
          { content: `${ind.name}`, styles: { fontStyle: 'bold' as const } },
          { content: `${ind.weight_percentage}%`, styles: { fontStyle: 'bold' as const, halign: 'center' as const } },
          { content: `${ind.target_value ?? 0} ${ind.target_unit || ''}`, styles: { fontStyle: 'bold' as const, halign: 'center' as const } },
          { content: '-', styles: { halign: 'center' as const } }
        ])

        // Add sub indicators if any
        if (subs && subs.length > 0) {
          subs.forEach(s => {
            const criteria = s.scoring_criteria as any[] || []
            const criteriaText = criteria.length > 0
              ? criteria.map(c => `      [${c.score}] ${c.label}`).join('\n')
              : '      Sesuai target'

            bodyData.push([
              `   ${s.code}`,
              {
                content: `   • ${s.name}\n\n      Kriteria Skor:\n${criteriaText}`,
                styles: { fontSize: 8 }
              },
              { content: `${s.weight_percentage}%`, styles: { halign: 'center' as const, fontSize: 8 } },
              { content: `${s.target_value ?? '-'}`, styles: { halign: 'center' as const, fontSize: 8 } },
              { content: 'Multi-Skor', styles: { halign: 'center' as const, fontSize: 8, fontStyle: 'italic' as const } }
            ])
          })
        }

        autoTable(doc, {
          startY: currentY,
          head: [['Kode', 'Indikator / Sub-Indikator', 'Bobot', 'Target', 'Skor Poin']],
          body: bodyData,
          theme: 'grid',
          headStyles: { fillColor: [52, 73, 94], textColor: 255, fontSize: 9 },
          styles: { fontSize: 8.5, cellPadding: 2.5 },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 100 },
            2: { cellWidth: 18 },
            3: { cellWidth: 22 },
            4: { cellWidth: 20 }
          },
          margin: { left: 15, right: 15, bottom: 25 },
        })

        currentY = (doc as any).lastAutoTable.finalY + 8

        // Safety check for next indicator
        if (currentY > 255) {
          doc.addPage()
          currentY = 20
        }
      }
      currentY += 5
    }
  } else {
    // Basic fallback if no unit selected
    const nextY = 110
    doc.setFont('helvetica', 'italic')
    doc.text('Catatan: Silakan pilih unit spesifik untuk melihat rincian indikator yang berlaku.', 15, nextY)
  }

  // Footer for all pages
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(footerText, centerX, doc.internal.pageSize.height - 15, { align: 'center' })
    doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 15)
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/**
 * Generate Dashboard Summary Report PDF
 */
export async function generateDashboardReportPDF(data: any, period: string): Promise<Uint8Array> {
  const doc = new jsPDF()
  const companyInfo = await getCompanyInfoServer()
  const footerSetting = await getSettingServer('footer')
  const footerText = footerSetting?.data?.text || 'Laporan dihasilkan secara otomatis oleh JASPEL System'

  const centerX = doc.internal.pageSize.width / 2

  // Add header to first page
  await addKopSurat(doc, companyInfo)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('LAPORAN RINGKASAN PERFORMANCE DASHBOARD', centerX, 42, { align: 'center' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Periode: ${period}`, centerX, 48, { align: 'center' })

  // 1. STATS SUMMARY
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('A. RINGKASAN STATISTIK', 15, 60)

  const stats = data.stats
  autoTable(doc, {
    startY: 65,
    head: [['Indikator Utama', 'Nilai', 'Keterangan']],
    body: [
      ['Total Pegawai', stats.totalEmployees, 'Pegawai aktif terdaftar'],
      ['Total Unit', stats.totalUnits, 'Unit organisasi aktif'],
      ['Rata-rata Skor KPI', stats.avgScore.toFixed(2), 'Skor rata-rata seluruh unit/pegawai'],
      ['Tingkat Penyelesaian', `${stats.completionRate.toFixed(1)}%`, 'Persentase penilaian yang sudah selesai']
    ],
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 }
  })

  // 2. UNIT PERFORMANCE (if available)
  if (data.unitPerformance && data.unitPerformance.length > 0) {
    let currentY = (doc as any).lastAutoTable.finalY + 10
    if (currentY > 250) { doc.addPage(); currentY = 20 }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('B. PERFORMA UNIT KERJA', 15, currentY)

    autoTable(doc, {
      startY: currentY + 5,
      head: [['No', 'Unit', 'Pegawai', 'Rata-rata Skor', 'Status']],
      body: data.unitPerformance.map((u: any, i: number) => [
        i + 1,
        u.name,
        u.employeeCount,
        u.avgScore.toFixed(2),
        u.status.toUpperCase()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 10 },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'center' }
      }
    })
  }

  // 3. TOP PERFORMERS
  let currentY = (doc as any).lastAutoTable.finalY + 12
  if (currentY > 230) { doc.addPage(); await addKopSurat(doc, companyInfo); currentY = 45 }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('C. PEGAWAI DENGAN PERFORMA TERTINGGI', 15, currentY)

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Rank', 'Nama Pegawai', 'Unit Kerja', 'Skor Akhir']],
    body: (data.topPerformers || []).map((p: any) => [
      p.rank,
      p.name,
      p.unit,
      p.score.toFixed(2)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94], textColor: 255 },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
    }
  })

  // 4. WORST PERFORMERS
  currentY = (doc as any).lastAutoTable.finalY + 12
  if (currentY > 230) { doc.addPage(); await addKopSurat(doc, companyInfo); currentY = 45 }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('D. PEGAWAI DENGAN PERFORMA TERENDAH / PERLU PERHATIAN', 15, currentY)

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Rank', 'Nama Pegawai', 'Unit Kerja', 'Skor Akhir']],
    body: (data.worstPerformers || []).map((p: any) => [
      p.rank,
      p.name,
      p.unit,
      p.score.toFixed(2)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [239, 68, 68], textColor: 255 },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
    }
  })

  // 5. KPI DISTRIBUTION
  currentY = (doc as any).lastAutoTable.finalY + 12
  if (currentY > 230) { doc.addPage(); await addKopSurat(doc, companyInfo); currentY = 45 }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('E. DISTRIBUSI RATA-RATA SKOR PER KATEGORI KPI', 15, currentY)

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Kategori / Indikator', 'Rata-rata Skor']],
    body: (data.kpiDistribution || []).map((d: any) => [
      d.name,
      d.value.toFixed(2)
    ]),
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], textColor: 255 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      2: { halign: 'right', fontStyle: 'bold' }
    }
  })

  // 6. PERFORMANCE TREND
  currentY = (doc as any).lastAutoTable.finalY + 12
  if (currentY > 230) { doc.addPage(); await addKopSurat(doc, companyInfo); currentY = 45 }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('F. TREN PERFORMA KPI (6 BULAN TERAKHIR)', 15, currentY)

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Bulan', 'Rata-rata P1', 'Rata-rata P2', 'Rata-rata P3', 'Total Skor']],
    body: (data.performanceTrend || []).map((t: any) => [
      t.month,
      t.p1.toFixed(2),
      t.p2.toFixed(2),
      t.p3.toFixed(2),
      t.total.toFixed(2)
    ]),
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], textColor: 255 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' }
    }
  })

  // Add page numbers and footer to all pages
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(footerText, centerX, doc.internal.pageSize.height - 10, { align: 'center' })
    doc.text(`Halaman ${i} dari ${totalPages}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10)
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/**
 * Generate Pool Overview PDF (Revenue & Deduction Report)
 */
export async function generatePoolOverviewPDF(data: {
  pool: any,
  revenueItems: any[],
  deductionItems: any[]
}): Promise<Uint8Array> {
  const doc = new jsPDF()
  const companyInfo = await getCompanyInfoServer()
  const footerSetting = await getSettingServer('footer')
  const footerText = footerSetting?.data?.text || 'Laporan dihasilkan secara otomatis oleh JASPEL System'

  await addKopSurat(doc, companyInfo)

  const centerX = doc.internal.pageSize.width / 2

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('LAPORAN POOL KEUANGAN & PENDAPATAN', centerX, 42, { align: 'center' })

  doc.setFontSize(11)
  doc.text(`Periode: ${data.pool.period}`, centerX, 48, { align: 'center' })

  // Summary Table
  const pBpjs = data.pool.allocation_percentage_bpjs ?? 100
  const pUmum = data.pool.allocation_percentage_umum ?? 100
  const allocBpjs = data.pool.allocated_bpjs ?? ((data.pool.revenue_bpjs || 0) * pBpjs / 100)
  const allocUmum = data.pool.allocated_umum ?? ((data.pool.revenue_umum || 0) * pUmum / 100)

  autoTable(doc, {
    startY: 55,
    head: [['Keterangan', 'Nilai (Rp)']],
    body: [
      [`Pendapatan BPJS Kesehatan (BPJS) - Alokasi Insentif (${pBpjs}%)`, `${formatCurrency(data.pool.revenue_bpjs || 0)} (Alokasi: ${formatCurrency(allocBpjs)})`],
      [`Pendapatan Umum (UMUM) - Alokasi Insentif (${pUmum}%)`, `${formatCurrency(data.pool.revenue_umum || 0)} (Alokasi: ${formatCurrency(allocUmum)})`],
      ['Total Pendapatan Kotor', formatCurrency(data.pool.revenue_total)],
      ['Total Potongan / Beban', formatCurrency(data.pool.deduction_total)],
      ['Pool Bersih (Net Pool)', formatCurrency(data.pool.net_pool || 0)],
      ['Total Insentif Dialokasikan', formatCurrency(data.pool.allocated_amount || (allocBpjs + allocUmum))],
    ],
    theme: 'grid',
    headStyles: { fillColor: [52, 152, 219], textColor: 255 },
    styles: { fontSize: 9.5, cellPadding: 3 },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' }
    }
  })

  let currentY = (doc as any).lastAutoTable.finalY + 10

  // Revenue Breakdown
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('1. RINCIAN PENDAPATAN', 15, currentY)

  autoTable(doc, {
    startY: currentY + 5,
    head: [['No', 'Kode', 'Jenis Pendapatan', 'Kategori', 'Deskripsi', 'Pasien', 'Jumlah (Rp)']],
    body: data.revenueItems.map((item, i) => [
      i + 1,
      item.revenue_code || (item.revenue_type === 'Pendapatan Umum' ? 'UMUM' : 'BPJS'),
      item.revenue_type || 'BPJS Kesehatan',
      item.category || 'Lainnya',
      item.description || '-',
      item.patient_count || 0,
      formatCurrency(item.amount)
    ]),
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 16, fontStyle: 'bold' },
      2: { cellWidth: 30 },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    }
  })

  currentY = (doc as any).lastAutoTable.finalY + 10
  if (currentY > 230) { doc.addPage(); await addKopSurat(doc, companyInfo); currentY = 45 }

  // Deduction Breakdown
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('2. RINCIAN POTONGAN', 15, currentY)

  autoTable(doc, {
    startY: currentY + 5,
    head: [['No', 'Deskripsi', 'Jumlah (Rp)']],
    body: data.deductionItems.map((item, i) => [
      i + 1,
      item.description,
      formatCurrency(item.amount)
    ]),
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
    }
  })

  // Footer / Signature placeholders
  currentY = (doc as any).lastAutoTable.finalY + 20
  if (currentY > 230) { doc.addPage(); await addKopSurat(doc, companyInfo); currentY = 45 }

  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Purbalingga, ${today}`, doc.internal.pageSize.width - 60, currentY)
  doc.text('Manajer Keuangan', doc.internal.pageSize.width - 60, currentY + 6)
  doc.text('( ____________________ )', doc.internal.pageSize.width - 60, currentY + 30)

  // Add footer to every page
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(footerText, centerX, doc.internal.pageSize.height - 10, { align: 'center' })
    doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 10)
  }

  return new Uint8Array(doc.output('arraybuffer'))
}
