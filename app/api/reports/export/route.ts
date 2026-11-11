import { NextRequest, NextResponse } from 'next/server'
import { exportToExcel } from '@/lib/export/excel-export'
import { exportToPDF } from '@/lib/export/pdf-export'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Export reports to Excel or PDF
 * Precision: 2 decimals in PDF and Excel
 */
export async function POST(request: NextRequest) {
  try {
    const { reportType, period, format, data, revenueType } = await request.json()

    if (!reportType || !period || !format || !data) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    let buffer: Buffer | Uint8Array
    let contentType: string
    let filename: string

    const revSuffix = revenueType ? `-${revenueType}` : ''

    if (format === 'excel') {
      buffer = await exportToExcel({
        reportType,
        period,
        data,
        revenueType,
      })
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      filename = `${reportType}-${period}${revSuffix}.xlsx`
    } else if (format === 'pdf') {
      buffer = await exportToPDF({
        reportType,
        period,
        data,
        revenueType,
      })
      contentType = 'application/pdf'
      filename = `${reportType}-${period}${revSuffix}.pdf`
    } else {
      return NextResponse.json(
        { error: 'Invalid format' },
        { status: 400 }
      )
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
