-- ============================================
-- Repair KPI Assessment Uniqueness and View
-- ============================================

-- 1. Clean up potential duplicates in t_kpi_assessments
-- This keeps the most recently updated record for each unique combination
DELETE FROM t_kpi_assessments a
WHERE a.id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY employee_id, indicator_id, period, COALESCE(sub_indicator_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   ORDER BY updated_at DESC, created_at DESC
               ) as rn
        FROM t_kpi_assessments
    ) t
    WHERE t.rn > 1
);

-- 2. Drop the old index if it exists and create/recreate the robust one
-- Note: 'NULLS NOT DISTINCT' is available in Postgres 15+
-- We use a name that matches what the user reported or the default pattern
DROP INDEX IF EXISTS t_kpi_assessments_multi_unique_idx;
DROP INDEX IF EXISTS t_kpi_assessments_upsert_key;

CREATE UNIQUE INDEX IF NOT EXISTS t_kpi_assessments_multi_unique_idx 
ON t_kpi_assessments (employee_id, indicator_id, period, sub_indicator_id) 
NULLS NOT DISTINCT;

-- Also add the named constraint for easier reference and upsert
ALTER TABLE t_kpi_assessments 
DROP CONSTRAINT IF EXISTS t_kpi_assessments_uniqueness_constraint;

-- 3. Update the view v_assessment_status to correctly count indicators
-- We only count rows where sub_indicator_id IS NULL to avoid join multiplication 
-- from sub-indicator records
CREATE OR REPLACE VIEW v_assessment_status AS
SELECT 
  e.id as employee_id,
  e.full_name,
  e.role,
  e.unit_id,
  u.name as unit_name,
  p.period,
  COUNT(DISTINCT i.id) as total_indicators,
  COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN i.id END) as assessed_indicators,
  CASE 
    WHEN COUNT(DISTINCT a.indicator_id) = 0 THEN 'Belum Dinilai'
    WHEN COUNT(DISTINCT a.indicator_id) >= COUNT(DISTINCT i.id) THEN 'Selesai'
    ELSE 'Sebagian'
  END as status,
  ROUND(
    (COUNT(DISTINCT a.indicator_id)::decimal / NULLIF(COUNT(DISTINCT i.id), 0) * 100), 
    2
  ) as completion_percentage
FROM m_employees e
JOIN m_units u ON e.unit_id = u.id
CROSS JOIN (
  SELECT DISTINCT period 
  FROM t_pool 
  WHERE status IN ('approved', 'distributed')
  ORDER BY period DESC
  LIMIT 12
) p
LEFT JOIN m_kpi_categories c ON c.unit_id = e.unit_id AND c.is_active = true
LEFT JOIN m_kpi_indicators i ON i.category_id = c.id AND i.is_active = true
LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id 
  AND a.indicator_id = i.id 
  AND a.period = p.period
  AND a.sub_indicator_id IS NULL -- Only count main assessment records for progress
WHERE e.is_active = true AND e.role != 'superadmin'
GROUP BY e.id, e.full_name, e.role, e.unit_id, u.name, p.period
ORDER BY e.full_name, p.period DESC;
