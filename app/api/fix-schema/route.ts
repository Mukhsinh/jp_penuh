import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const projectRef = process.env.SUPABASE_PROJECT_REF || 'fzqjxmkqegotbptmetpp'
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN_KEY

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing SUPABASE_ACCESS_TOKEN' }, { status: 500 })
    }

    const sql = `
      -- 1. Drop the old 3-column unique constraint
      ALTER TABLE t_kpi_assessments
      DROP CONSTRAINT IF EXISTS t_kpi_assessments_employee_id_indicator_id_period_key;

      -- 2. Drop the old 4-column unique index (without revenue_type)
      DROP INDEX IF EXISTS t_kpi_assessments_multi_unique_idx;
      DROP INDEX IF EXISTS t_kpi_assessments_upsert_key;

      -- 3. Add revenue_type column if it doesn't exist
      ALTER TABLE t_kpi_assessments
      ADD COLUMN IF NOT EXISTS revenue_type VARCHAR(10) DEFAULT 'bpjs';

      -- 4. Add sub_indicator_id column if it doesn't exist
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 't_kpi_assessments' AND column_name = 'sub_indicator_id'
        ) THEN
          ALTER TABLE t_kpi_assessments ADD COLUMN sub_indicator_id UUID REFERENCES m_kpi_sub_indicators(id) ON DELETE CASCADE;
        END IF;
      END $$;

      -- 5. Clean up potential duplicates before creating the new constraint
      DELETE FROM t_kpi_assessments a
      WHERE a.id IN (
          SELECT id FROM (
              SELECT id,
                     ROW_NUMBER() OVER (
                         PARTITION BY employee_id, indicator_id, period,
                                      COALESCE(sub_indicator_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                      COALESCE(revenue_type, 'bpjs')
                         ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                     ) as rn
              FROM t_kpi_assessments
          ) t
          WHERE t.rn > 1
      );

      -- 6. Create the proper 5-column unique index
      DROP INDEX IF EXISTS t_kpi_assessments_unique_key;
      CREATE UNIQUE INDEX t_kpi_assessments_unique_key
      ON t_kpi_assessments (employee_id, indicator_id, period, sub_indicator_id, revenue_type)
      NULLS NOT DISTINCT;
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
      message: 'KPI assessment constraints fixed successfully.',
      details: result
    })
  } catch (error: any) {
    console.error('Fix constraints error:', error)
    return NextResponse.json({
      error: error.message || 'Unknown error'
    }, { status: 500 })
  }
}
