import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
    HeadingLevel,
    ShadingType
} from 'docx'
import { createAdminClient } from '../supabase/server'
import { formatCurrency, formatDecimal, formatDate } from '../utils/format'

export async function generateSystemGuideDocx(unitId?: string, revenueType: string = 'all'): Promise<Buffer> {
    const adminClient = await createAdminClient()

    // Get settings for Kop Surat & App Info
    const { data: settingsData } = await adminClient
        .from('t_settings')
        .select('key, value')
        .in('key', ['company_info', 'footer'])

    let appSettings = {
        appName: 'JASPEL',
        organizationName: 'RUMAH SAKIT SUNGAI BAHAR',
        address: 'Kabupaten Muaro Jambi, Provinsi Jambi',
        email: 'admin@sungaipenuh.com'
    }

    if (settingsData) {
        const companyInfo = (settingsData.find(s => s.key === 'company_info')?.value as any) || {}
        appSettings.appName = companyInfo.appName || appSettings.appName
        appSettings.organizationName = companyInfo.name || appSettings.organizationName
        appSettings.address = companyInfo.address || appSettings.address
        appSettings.email = companyInfo.email || appSettings.email
    }

    const getRevenueLabel = (type: string) => {
        if (type === 'bpjs') return 'PENDAPATAN BPJS KESEHATAN'
        if (type === 'umum') return 'PENDAPATAN UMUM'
        return 'GABUNGAN (BPJS & UMUM)'
    }

    const children: any[] = []

    // Header / Kop Surat
    children.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: 'PEMERINTAH KABUPATEN MUARO JAMBI', bold: true, size: 24, font: 'Calibri' })
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: appSettings.organizationName.toUpperCase(), bold: true, size: 28, font: 'Calibri', color: '1E3A8A' })
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: `${appSettings.address} | Email: ${appSettings.email}`, size: 18, font: 'Calibri', color: '475569' })
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: '----------------------------------------------------------------------------------------------------------------------------------', size: 16, color: '1E293B' })
            ]
        }),
        new Paragraph({ text: '', spacing: { after: 200 } })
    )

    if (!unitId) {
        // General System Guide
        children.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                heading: HeadingLevel.HEADING_1,
                children: [
                    new TextRun({ text: 'PEDOMAN KPI SISTEM (JASPEL)', bold: true, size: 28, font: 'Calibri' })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: `[ VERSI REGULASI: ${getRevenueLabel(revenueType)} ]`, bold: true, size: 20, color: '1E3A8A', font: 'Calibri' })
                ],
                spacing: { after: 300 }
            })
        )

        // Category summary table
        children.push(
            new Paragraph({
                children: [
                    new TextRun({ text: '1. STRUKTUR KATEGORI PENILAIAN (P1, P2, P3)', bold: true, size: 22, font: 'Calibri' })
                ],
                spacing: { before: 200, after: 100 }
            })
        )

        const catRows = [
            ['Kategori P1 (Kinerja Utama)', 'Mengukur output layanan langsung / kegiatan medis & non-medis pokok sesuai tupoksi unit.'],
            ['Kategori P2 (Kinerja Tambahan)', 'Mengukur kontribusi administrasi, pelaporan, tugas tambahan, dan manajemen operasional.'],
            ['Kategori P3 (Perilaku & Absensi)', 'Mengukur kedisiplinan kehadiran (absensi) dan perilaku kerja bulanan pegawai.']
        ]

        const catTableRows = [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 35, type: WidthType.PERCENTAGE },
                        shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                        children: [new Paragraph({ children: [new TextRun({ text: 'Komponen Kategori', bold: true, color: 'FFFFFF', size: 18, font: 'Calibri' })] })]
                    }),
                    new TableCell({
                        width: { size: 65, type: WidthType.PERCENTAGE },
                        shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                        children: [new Paragraph({ children: [new TextRun({ text: 'Deskripsi Penilaian', bold: true, color: 'FFFFFF', size: 18, font: 'Calibri' })] })]
                    })
                ]
            }),
            ...catRows.map(row => new TableRow({
                children: [
                    new TableCell({
                        width: { size: 35, type: WidthType.PERCENTAGE },
                        children: [new Paragraph({ children: [new TextRun({ text: row[0], bold: true, size: 18, font: 'Calibri' })] })]
                    }),
                    new TableCell({
                        width: { size: 65, type: WidthType.PERCENTAGE },
                        children: [new Paragraph({ children: [new TextRun({ text: row[1], size: 18, font: 'Calibri' })] })]
                    })
                ]
            }))
        ]

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: catTableRows
            }),
            new Paragraph({ text: '', spacing: { after: 300 } })
        )

    } else {
        // Unit Specific Guide
        const { data: unit } = await adminClient
            .from('m_units')
            .select('code, name, kpi_schema_mode')
            .eq('id', unitId)
            .single()

        if (unit) {
            const isDiffMode = (unit.kpi_schema_mode as string) === 'different'

            children.push(
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: 'PEDOMAN KPI UNIT', bold: true, size: 28, font: 'Calibri' })
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: `[ ${getRevenueLabel(revenueType)} ]`, bold: true, size: 20, color: '1E3A8A', font: 'Calibri' })
                    ],
                    spacing: { after: 200 }
                })
            )

            // Metadata info
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: 'Unit Kerja: ', bold: true, size: 18, font: 'Calibri' }),
                        new TextRun({ text: `${unit.code} - ${unit.name}`, size: 18, font: 'Calibri' })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: 'Skema Penggunaan: ', bold: true, size: 18, font: 'Calibri' }),
                        new TextRun({ text: isDiffMode ? 'KPI Berbeda per Jenis Pendapatan (BPJS vs UMUM)' : 'KPI Sama untuk Semua Jenis Pendapatan', size: 18, font: 'Calibri' })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: 'Tanggal Penetapan: ', bold: true, size: 18, font: 'Calibri' }),
                        new TextRun({ text: formatDate(new Date()), size: 18, font: 'Calibri' })
                    ],
                    spacing: { after: 300 }
                })
            )

            const allowedRevenueTypes = revenueType === 'all' ? ['all', 'bpjs', 'umum'] : [revenueType, 'all']

            let categoriesQuery = adminClient
                .from('m_kpi_categories')
                .select('*')
                .eq('unit_id', unitId)
                .eq('is_active', true)

            if (revenueType !== 'all') {
                categoriesQuery = categoriesQuery.or(`revenue_type.in.(${allowedRevenueTypes.join(',')}),revenue_type.is.null`)
            }

            const { data: categories } = await categoriesQuery.order('category')

            for (const cat of categories || []) {
                const bobotText = cat.is_weighted !== false ? `(Bobot: ${cat.weight_percentage || 0}%)` : '(Tanpa Bobot)'

                children.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: `KATEGORI ${cat.category}: ${cat.category_name} ${bobotText}`, bold: true, size: 20, color: '1E3A8A', font: 'Calibri' })
                        ],
                        spacing: { before: 200, after: 100 }
                    })
                )

                const { data: indicators } = await adminClient
                    .from('m_kpi_indicators')
                    .select('*')
                    .eq('category_id', cat.id)
                    .eq('is_active', true)
                    .order('code')

                const tableRows: TableRow[] = [
                    // Table Header - 4 COLUMNS (No Target & Satuan column!)
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 15, type: WidthType.PERCENTAGE },
                                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                                children: [new Paragraph({ children: [new TextRun({ text: 'Kode', bold: true, color: 'FFFFFF', size: 16, font: 'Calibri' })] })]
                            }),
                            new TableCell({
                                width: { size: 45, type: WidthType.PERCENTAGE },
                                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                                children: [new Paragraph({ children: [new TextRun({ text: 'Indikator / Sub-Indikator', bold: true, color: 'FFFFFF', size: 16, font: 'Calibri' })] })]
                            }),
                            new TableCell({
                                width: { size: 15, type: WidthType.PERCENTAGE },
                                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Bobot', bold: true, color: 'FFFFFF', size: 16, font: 'Calibri' })] })]
                            }),
                            new TableCell({
                                width: { size: 25, type: WidthType.PERCENTAGE },
                                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                                children: [new Paragraph({ children: [new TextRun({ text: 'Kriteria Penilaian / Indeks', bold: true, color: 'FFFFFF', size: 16, font: 'Calibri' })] })]
                            })
                        ]
                    })
                ]

                for (const ind of indicators || []) {
                    let indAdditionalInfo = ''
                    if (ind.base_index_value && Number(ind.base_index_value) > 0) {
                        const formatted = Number(ind.base_index_value) >= 1000 ? formatCurrency(ind.base_index_value) : formatDecimal(ind.base_index_value, 4)
                        indAdditionalInfo = ` (Tarif/Indeks: ${formatted})`
                    }

                    // Indicator Row (shaded light slate F1F5F9)
                    tableRows.push(
                        new TableRow({
                            children: [
                                new TableCell({
                                    width: { size: 15, type: WidthType.PERCENTAGE },
                                    shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                                    children: [new Paragraph({ children: [new TextRun({ text: ind.code, bold: true, size: 16, font: 'Calibri' })] })]
                                }),
                                new TableCell({
                                    width: { size: 45, type: WidthType.PERCENTAGE },
                                    shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                                    children: [new Paragraph({ children: [new TextRun({ text: ind.name + indAdditionalInfo, bold: true, size: 16, font: 'Calibri' })] })]
                                }),
                                new TableCell({
                                    width: { size: 15, type: WidthType.PERCENTAGE },
                                    shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ind.calculation_method === 'priority' ? 'Prioritas' : `${ind.weight_percentage || 0}%`, bold: true, size: 16, font: 'Calibri' })] })]
                                }),
                                new TableCell({
                                    width: { size: 25, type: WidthType.PERCENTAGE },
                                    shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                                    children: [new Paragraph({ children: [new TextRun({ text: ind.calculation_method === 'priority' ? 'Metode Prioritas (Direct Payout)' : 'Metode Indeksasi (PIR)', bold: true, size: 16, font: 'Calibri' })] })]
                                })
                            ]
                        })
                    )

                    const { data: subs } = await adminClient
                        .from('m_kpi_sub_indicators')
                        .select('*')
                        .eq('indicator_id', ind.id)
                        .eq('is_active', true)
                        .order('code')

                    for (const sub of subs || []) {
                        let criteriaText = '-'
                        if (sub.measurement_type === 'quantitative') {
                            const formattedSub = Number(sub.base_index_value || 0) >= 1000
                                ? formatCurrency(sub.base_index_value || 0)
                                : formatDecimal(sub.base_index_value || 0, 4)
                            criteriaText = `Kuantitatif | Tarif Dasar: ${formattedSub}`
                        } else if (sub.scoring_criteria && Array.isArray(sub.scoring_criteria) && sub.scoring_criteria.length > 0) {
                            criteriaText = sub.scoring_criteria
                                .map((c: any) => `• ${c.label || ''} (Skor: ${c.score ?? '-'})`)
                                .join('; ')
                        }

                        tableRows.push(
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: { size: 15, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({ children: [new TextRun({ text: `  ${sub.code}`, size: 15, font: 'Calibri' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 45, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({ children: [new TextRun({ text: sub.name + (sub.description ? ` (${sub.description})` : ''), size: 15, font: 'Calibri' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 15, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${sub.weight_percentage || 0}%`, size: 15, font: 'Calibri' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 25, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({ children: [new TextRun({ text: criteriaText, size: 15, font: 'Calibri' })] })]
                                    })
                                ]
                            })
                        )
                    }
                }

                children.push(
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: tableRows
                    }),
                    new Paragraph({ text: '', spacing: { after: 200 } })
                )
            }

            // Signature Block
            const unitTitleName = unit.name.toUpperCase().startsWith('UNIT') ? unit.name : `Unit ${unit.name}`

            children.push(
                new Paragraph({ text: '', spacing: { before: 300 } }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                        insideHorizontal: { style: BorderStyle.NONE },
                        insideVertical: { style: BorderStyle.NONE }
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    width: { size: 50, type: WidthType.PERCENTAGE },
                                    children: [
                                        new Paragraph({ children: [new TextRun({ text: 'Mengetahui / Penanggung Jawab,', size: 16, font: 'Calibri' })] }),
                                        new Paragraph({ children: [new TextRun({ text: `Kepala ${unitTitleName}`, size: 16, font: 'Calibri' })] }),
                                        new Paragraph({ text: '', spacing: { after: 600 } }),
                                        new Paragraph({ children: [new TextRun({ text: '----------------------------------------', size: 16, font: 'Calibri' })] }),
                                        new Paragraph({ children: [new TextRun({ text: 'NIP. .....................................', size: 16, font: 'Calibri' })] })
                                    ]
                                }),
                                new TableCell({
                                    width: { size: 50, type: WidthType.PERCENTAGE },
                                    children: [
                                        new Paragraph({ children: [new TextRun({ text: 'Disetujui Oleh,', size: 16, font: 'Calibri' })] }),
                                        new Paragraph({ children: [new TextRun({ text: 'Direktur / Management RSUD', size: 16, font: 'Calibri' })] }),
                                        new Paragraph({ text: '', spacing: { after: 600 } }),
                                        new Paragraph({ children: [new TextRun({ text: '----------------------------------------', size: 16, font: 'Calibri' })] }),
                                        new Paragraph({ children: [new TextRun({ text: 'NIP. .....................................', size: 16, font: 'Calibri' })] })
                                    ]
                                })
                            ]
                        })
                    ]
                })
            )
        }
    }

    const doc = new Document({
        sections: [
            {
                properties: {},
                children: children
            }
        ]
    })

    return await Packer.toBuffer(doc)
}
