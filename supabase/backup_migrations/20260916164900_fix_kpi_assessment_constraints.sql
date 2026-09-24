-- ============================================
-- Fix KPI Assessment Unique Constraints
-- ============================================
-- Problem: Old 3-column constraint UNIQUE(employee_id, indicator_id, period)
-- blocks sub-indicator rows and dual revenue_type (bpjs/umum) rows.
-- Solution: Drop the old constraint and recreate a proper one that
-- includes sub_indicator_id and revenue_type.

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
ALTER TABLE t_kpi_assessments
ADD COLUMN IF NOT EXISTS sub_indicator_id UUID REFERENCES m_kpi_sub_indicators(id) ON DELETE CASCADE;

-- 5. Clean up potential duplicates before creating the new constraint
-- Keep the most recently updated record for each unique combination
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
CREATE UNIQUE INDEX IF NOT EXISTS t_kpi_assessments_unique_key
ON t_kpi_assessments (employee_id, indicator_id, period, sub_indicator_id, revenue_type)
NULLS NOT DISTINCT;
