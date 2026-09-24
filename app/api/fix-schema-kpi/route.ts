import { NextResponse } from 'next/server'

export async function POST() {
    try {
        const projectRef = process.env.SUPABASE_PROJECT_REF || 'fzqjxmkqegotbptmetpp'
        const accessToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN_KEY

        if (!accessToken) {
            return NextResponse.json({ error: 'Missing SUPABASE_ACCESS_TOKEN' }, { status: 500 })
        }

        const sql = `
      -- 1. Add revenue_type column to m_kpi_categories
      ALTER TABLE m_kpi_categories
      ADD COLUMN IF NOT EXISTS revenue_type VARCHAR(20) DEFAULT 'bpjs';

      -- 2. Add missing columns to m_kpi_indicators
      ALTER TABLE m_kpi_indicators
      ADD COLUMN IF NOT EXISTS measurement_type VARCHAR(50) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS unit_tariff NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT '{}'::text[];

      -- 3. In case any existing m_kpi_sub_indicators lacks an array structure, enforce consistency
      ALTER TABLE m_kpi_sub_indicators
      ADD COLUMN IF NOT EXISTS measurement_type VARCHAR(50) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS unit_tariff NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT '{}'::text[];
    `

        // Use Supabase Management API to run SQL
        const response = await fetch(
            `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: sql }),
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Supabase API error:', response.status, errorText)
            return NextResponse.json({
                error: `Supabase API error: ${response.status}`,
                details: errorText
            }, { status: 500 })
        }

        const result = await response.json()

        return NextResponse.json({
            success: true,
            message: 'KPI Schema columns fixed successfully.',
            details: result
        })
    } catch (error: any) {
        console.error('Fix schema kpi error:', error)
        return NextResponse.json({
            error: error.message || 'Unknown error'
        }, { status: 500 })
    }
}
