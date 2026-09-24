-- Update v_assessment_status to include all periods from t_pool regardless of status
-- This ensures that draft periods are visible in the assessment module

CREATE OR REPLACE VIEW v_assessment_status AS
SELECT 
  e.id as employee_id,
  e.full_name,
  e.unit_id,
  u.name as unit_name,
  p.period,
  COUNT(i.id) as total_indicators,
  COUNT(a.id) as assessed_indicators,
  CASE 
    WHEN COUNT(a.id) = 0 THEN 'Belum Dinilai'
    WHEN COUNT(a.id) = COUNT(i.id) THEN 'Selesai'
    ELSE 'Sebagian'
  END as status,
  ROUND((COUNT(a.id)::decimal / NULLIF(COUNT(i.id), 0) * 100), 2) as completion_percentage
FROM m_employees e
JOIN m_units u ON e.unit_id = u.id
CROSS JOIN (
  SELECT DISTINCT period 
  FROM t_pool 
  -- Removed the status filter here
  ORDER BY period DESC
  LIMIT 12 
) p
LEFT JOIN m_kpi_categories c ON c.unit_id = e.unit_id AND c.is_active = true
LEFT JOIN m_kpi_indicators i ON i.category_id = c.id AND i.is_active = true
LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id 
  AND a.indicator_id = i.id 
  AND a.period = p.period
WHERE e.is_active = true
GROUP BY e.id, e.full_name, e.unit_id, u.name, p.period
ORDER BY e.full_name, p.period DESC;
