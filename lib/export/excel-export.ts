import * as XLSX from 'xlsx'
import { getSettingServer, getCompanyInfoServer } from '@/lib/services/settings.server.service'

interface ExportData {
  headers: string[]
  data: any[][]
  sheetName?: string
  fileName?: string
}

export interface ReportExportOptions {
  reportType: string
  period: string
  data: any[]
  revenueType?: string
}

/**
 * Export report to Excel with formatting
 * Requirements: 12.5, 16.1, 16.2, 16.7
 */
export async function exportToExcel(options: ReportExportOptions): Promise<Buffer> {
  const { reportType, period, data } = options

  // Create workbook
  const wb = XLSX.utils.book_new()

  // Prepare data based on report type
  let wsData: any[][] = []
  let sheetName = 'Report'

  switch (reportType) {
    case 'incentive':
    case 'employee-slip':
      sheetName = reportType === 'incentive' ? 'Incentive Report' : 'Employee Slip'
      wsData = [
        ['NIP/NIK', 'NIK', 'Nama Pegawai', 'Unit', 'Proporsi Unit', 'Status Pegawai', 'Golongan', 'Nama Bank', 'No. Rekening', 'Nama Pemilik Rek', 'Status Pajak', 'P1', 'P2', 'P3', 'Total Indeks', 'Insentif Prioritas (Rp)', 'PIR', 'Potongan (Rp)', 'Distribusi Potongan (Rp)', 'Insentif Bruto', 'Pajak', 'Keterangan Pajak', 'Insentif Netto'],
        ...data.map((row: any) => [
          row.employee_code || '-',
          row.nik || '-',
          row.employee_name,
          row.unit || '-',
          row.unit_proportion ? `${Number(row.unit_proportion).toFixed(2)}%` : '-',
          row.employee_status || '-',
          row.pns_grade || '-',
          row.bank_name || '-',
          row.bank_account_number || '-',
          row.bank_account_holder || row.employee_name || '-',
          row.tax_status || 'Non-PKP',
          Number(Number(row.p1_score || 0).toFixed(2)),
          Number(Number(row.p2_score || 0).toFixed(2)),
          Number(Number(row.p3_score || 0).toFixed(2)),
          Number(Number(row.total_score || 0).toFixed(2)),
          Number(Number(row.total_priority_score || row.total_activity_rupiah || row.total_activity || 0).toFixed(2)),
          Number(Number(row.pir_value || 0).toFixed(2)),
          Number(Number(row.potongan || 0).toFixed(2)),
          Number(Number(row.distribusi_potongan || 0).toFixed(2)),
          Number(Number(row.gross_incentive || 0).toFixed(2)),
          Number(Number(row.tax_amount || 0).toFixed(2)),
          row.tax_detail || '-',
          Number(Number(row.net_incentive || 0).toFixed(2)),
        ]),
      ]
      break

    case 'kpi-achievement': {
      sheetName = 'KPI Achievement'

      const employeesData: Record<string, typeof data> = {}
      for (const r of data) {
        const empName = r.employee_name || 'Tidak Diketahui'
        if (!employeesData[empName]) employeesData[empName] = []
        employeesData[empName].push(r)
      }

      const employeeNames = Object.keys(employeesData).sort()

      for (let eIdx = 0; eIdx < employeeNames.length; eIdx++) {
        const empName = employeeNames[eIdx]
        const empData = employeesData[empName]

        if (eIdx > 0) {
          wsData.push([''])
          wsData.push(['--------------------------------------------------------------------------------'])
          wsData.push([''])
        }

        wsData.push([`Pegawai: ${empName}  |  Unit: ${empData[0]?.unit_name || '-'}`])
        wsData.push([''])

        const indexData = empData.filter((d: any) => !d.is_activity)
        const activityData = empData.filter((d: any) => d.is_activity)

        if (indexData.length > 0) {
          wsData.push(['--- KATEGORI BERBASIS INDEKS ---'])
          wsData.push(['No', 'Kategori', 'Indikator', 'Target', 'Realisasi', 'Capaian (%)', 'Nilai', 'Selisih (Gap)'])
          indexData.forEach((row: any, i: number) => {
            wsData.push([
              i + 1,
              row.category,
              row.indicator_name,
              row.target_value,
              row.realization_value,
              row.achievement_percentage,
              row.score,
              row.gap
            ])
          })
          wsData.push([''])
        }

        if (activityData.length > 0) {
          wsData.push(['--- KATEGORI BERBASIS AKTIVITAS ---'])
          wsData.push(['No', 'Kategori', 'Indikator', 'Volume / Realisasi'])
          activityData.forEach((row: any, i: number) => {
            wsData.push([
              i + 1,
              row.category,
              row.indicator_name,
              row.realization_value
            ])
          })
          wsData.push([''])
        }
      }
      break
    }

    case 'unit-comparison':
      sheetName = 'Unit Comparison'
      wsData = [
        ['Unit Name', 'Average Score', 'Total Incentive', 'Employee Count'],
        ...data.map((row: any) => [
          row.unit_name,
          row.average_score,
          row.total_incentive,
          row.employee_count,
        ]),
      ]
      break

    default:
      throw new Error('Invalid report type')
  }

  // Fetch Company Info for Kop Surat
  const companyInfo = await getCompanyInfoServer()

  // Build Kop Surat
  const kopSurat = [
    [companyInfo.name.toUpperCase()],
    [`${companyInfo.address}`],
    [
      [
        companyInfo.phone ? `Telp: ${companyInfo.phone}` : null,
        companyInfo.email ? `Email: ${companyInfo.email}` : null
      ].filter(Boolean).join(' | ')
    ],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    [sheetName.toUpperCase()],
    [`Periode: ${period}`],
    ['']
  ]

  // Prepend Kop Surat to wsData
  wsData = [...kopSurat, ...wsData]

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Apply formatting: format any cell where the value is 'Nama Pegawai/Unit' or similar, and that entire row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let r = range.s.r; r <= range.e.r; r++) {
    const firstCellAddress = XLSX.utils.encode_cell({ r, c: 0 })
    const cellValue = ws[firstCellAddress]?.v

    // Header Style
    if (cellValue === 'Nama Pegawai / Unit' || cellValue === 'NIP/NIK' || cellValue === 'Unit Name' || cellValue === 'No') {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c })
        if (ws[cellAddr]) {
          ws[cellAddr].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: '2563EB' } }, // Professional Blue
          }
        }
      }
    }

    // Employee name header style
    if (typeof cellValue === 'string' && cellValue.startsWith('Pegawai:')) {
      ws[firstCellAddress].s = {
        font: { bold: true, sz: 12, color: { rgb: "1E3A5F" } },
      }
    }

    // Sub-title Style
    if (cellValue === '--- KATEGORI BERBASIS INDEKS ---' || cellValue === '--- KATEGORI BERBASIS AKTIVITAS ---') {
      ws[firstCellAddress].s = {
        font: { bold: true, color: { rgb: "2563EB" } },
      }
    }
  }

  // Format Kop Surat Title to be bold and large
  for (let r = 0; r < kopSurat.length; r++) {
    const cell = XLSX.utils.encode_cell({ r, c: 0 })
    if (ws[cell]) {
      ws[cell].s = { font: { bold: true, sz: 14 } }
    }
  }

  // Set column widths based on content
  const colWidths = [
    { wch: 15 }, // NIP/NIK
    { wch: 20 }, // NIK
    { wch: 30 }, // Nama Pegawai
    { wch: 25 }, // Unit
    { wch: 15 }, // Proporsi Unit
    { wch: 15 }, // Status
    { wch: 12 }, // Golongan
    { wch: 15 }, // Bank
    { wch: 20 }, // Rekening
    { wch: 25 }, // Pemilik
    { wch: 15 }, // Pajak Status
    { wch: 10 }, // P1
    { wch: 10 }, // P2
    { wch: 10 }, // P3
    { wch: 12 }, // Total
    { wch: 15 }, // PIR
    { wch: 18 }, // Kuantitatif
    { wch: 18 }, // Bruto
    { wch: 15 }, // Pajak
    { wch: 20 }, // Ket Pajak
    { wch: 18 }, // Netto
  ]
  ws['!cols'] = colWidths

  // Add footer rows
  const { data: footerData } = await getSettingServer('footer')
  const footerText = footerData?.text || 'JASPEL Enterprise'
  const dateStr = new Date().toLocaleString('id-ID')

  // Add empty row and footer
  const footerRow = range.e.r + 2
  XLSX.utils.sheet_add_aoa(ws, [['']], { origin: footerRow })
  XLSX.utils.sheet_add_aoa(ws, [[footerText]], { origin: footerRow + 1 })
  XLSX.utils.sheet_add_aoa(ws, [[`Dicetak: ${dateStr}`]], { origin: footerRow + 2 })

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // Generate buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return buffer as Buffer
}

/**
 * Export data to Excel file (client-side)
 */
export async function exportToExcelFile({
  headers,
  data,
  sheetName = 'Sheet1',
  fileName = 'export.xlsx'
}: ExportData) {
  // Create workbook
  const wb = XLSX.utils.book_new()

  // Fetch Company Info for Kop Surat
  const companyInfo = await getCompanyInfoServer()

  // Build Kop Surat
  const kopSurat = [
    [companyInfo.name.toUpperCase()],
    [`${companyInfo.address}`],
    [
      [
        companyInfo.phone ? `Telp: ${companyInfo.phone}` : null,
        companyInfo.email ? `Email: ${companyInfo.email}` : null
      ].filter(Boolean).join(' | ')
    ],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    [sheetName.toUpperCase()],
    ['']
  ]

  // Combine kop, headers and data
  const wsData = [...kopSurat, headers, ...data]

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths
  const colWidths = headers.map(() => ({ wch: 15 }))
  ws['!cols'] = colWidths

  const headerRowIdx = kopSurat.length
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  // Format headers
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRowIdx, c: col })
    if (!ws[cellAddress]) continue
    ws[cellAddress].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: '2563EB' } },
    }
  }

  // Format Kop
  for (let r = 0; r < kopSurat.length; r++) {
    const cell = XLSX.utils.encode_cell({ r, c: 0 })
    if (ws[cell]) ws[cell].s = { font: { bold: true } }
  }

  // Add footer rows
  const { data: footerData } = await getSettingServer('footer')
  const footerText = footerData?.text || 'JASPEL Enterprise'
  const dateStr = new Date().toLocaleString('id-ID')

  const footerRow = kopSurat.length + 1 + data.length + 2
  XLSX.utils.sheet_add_aoa(ws, [['']], { origin: footerRow })
  XLSX.utils.sheet_add_aoa(ws, [[footerText]], { origin: footerRow + 1 })
  XLSX.utils.sheet_add_aoa(ws, [[`Dicetak: ${dateStr}`]], { origin: footerRow + 2 })

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // Generate Excel file
  XLSX.writeFile(wb, fileName)
}

/**
 * Export KPI realization template
 */
export async function exportKPITemplate(
  employees: Array<{ code: string; name: string }>,
  indicators: Array<{ code: string; name: string; target: number }>
) {
  const headers = [
    'Employee Code',
    'Employee Name',
    'Indicator Code',
    'Indicator Name',
    'Target',
    'Realization',
    'Notes'
  ]

  const data: any[][] = []

  employees.forEach(emp => {
    indicators.forEach(ind => {
      data.push([
        emp.code,
        emp.name,
        ind.code,
        ind.name,
        ind.target,
        '', // Empty for user input
        ''  // Empty for notes
      ])
    })
  })

  await exportToExcelFile({
    headers,
    data,
    sheetName: 'KPI Realization',
    fileName: 'kpi-realization-template.xlsx'
  })
}

/**
 * Export calculation results
 */
export async function exportCalculationResults(
  results: Array<{
    employeeCode: string
    employeeName: string
    unit: string
    p1Score: number
    p2Score: number
    p3Score: number
    finalScore: number
    grossIncentive: number
    taxAmount: number
    netIncentive: number
  }>,
  period: string
) {
  const headers = [
    'Employee Code',
    'Employee Name',
    'Unit',
    'P1 Score',
    'P2 Score',
    'P3 Score',
    'Final Score',
    'Gross Incentive',
    'Tax Amount',
    'Net Incentive'
  ]

  const data = results.map(r => [
    r.employeeCode,
    r.employeeName,
    r.unit,
    r.p1Score.toFixed(2),
    r.p2Score.toFixed(2),
    r.p3Score.toFixed(2),
    r.finalScore.toFixed(2),
    r.grossIncentive.toFixed(2),
    r.taxAmount.toFixed(2),
    r.netIncentive.toFixed(2)
  ])

  await exportToExcelFile({
    headers,
    data,
    sheetName: 'Calculation Results',
    fileName: `calculation-results-${period}.xlsx`
  })
}

/**
 * Parse Excel file for bulk import
 */
export async function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })

        // Get first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        resolve(jsonData)
      } catch (error: any) {
        reject(error)
      }
    }

    reader.onerror = (error) => reject(error)
    reader.readAsBinaryString(file)
  })
}
