import { NextRequest, NextResponse } from 'next/server'
import { generateSystemGuide } from '@/lib/export/guide-generator'
import { generateSystemGuideDocx } from '@/lib/export/guide-word-generator'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unitId = searchParams.get('unitId') || undefined
    const revenueType = searchParams.get('revenueType') || 'all'
    const format = searchParams.get('format') || 'pdf'

    const isWord = format === 'word' || format === 'docx'
    const revTag = revenueType === 'bpjs' ? '_BPJS' : revenueType === 'umum' ? '_UMUM' : ''

    if (isWord) {
      const docxBuffer = await generateSystemGuideDocx(unitId, revenueType)
      const filename = unitId
        ? `Petunjuk_KPI_Unit_${unitId}${revTag}_${new Date().toISOString().split('T')[0]}.docx`
        : `Panduan_Sistem_JASPEL${revTag}_${new Date().toISOString().split('T')[0]}.docx`

      return new NextResponse(new Uint8Array(docxBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': docxBuffer.length.toString()
        }
      })
    } else {
      const pdfBuffer = await generateSystemGuide(unitId, revenueType)
      const filename = unitId
        ? `Petunjuk_KPI_Unit_${unitId}${revTag}_${new Date().toISOString().split('T')[0]}.pdf`
        : `Panduan_Sistem_JASPEL${revTag}_${new Date().toISOString().split('T')[0]}.pdf`

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': pdfBuffer.length.toString()
        }
      })
    }

  } catch (error: any) {
    console.error('Error generating system guide:', error)
    return NextResponse.json(
      { error: 'Gagal menghasilkan panduan sistem' },
      { status: 500 }
    )
  }
}
