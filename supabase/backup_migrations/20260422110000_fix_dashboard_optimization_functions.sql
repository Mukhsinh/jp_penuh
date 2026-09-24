-- Fix Dashboard Optimization Functions
-- This migration consolidates missing functions for the dashboard

-- 1. Function to get aggregated dashboard stats
CREATE OR REPLACE FUNCTION get_dashboard_stats_optimized()
RETURNS TABLE (
  total_employees BIGINT,
  total_units BIGINT,
  avg_score NUMERIC,
  completion_rate NUMERIC,
  employee_trend NUMERIC,
  score_trend NUMERIC,
  completion_trend NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_month_start TIMESTAMPTZ := date_trunc('month', NOW());
  prev_month_start TIMESTAMPTZ := current_month_start - interval '1 month';
BEGIN
  RETURN QUERY
  WITH current_stats AS (
    SELECT 
      (SELECT COUNT(*) FROM m_employees WHERE is_active = true) as total_employees,
      (SELECT COUNT(*) FROM m_units WHERE is_active = true) as total_units,
      (SELECT COALESCE(AVG(score), 0) FROM t_kpi_assessments 
       WHERE period = to_char(NOW(), 'YYYY-MM')) as avg_score,
      (SELECT 
         CASE WHEN COUNT(DISTINCT id) > 0 THEN 
           (COUNT(DISTINCT a.employee_id)::NUMERIC / COUNT(DISTINCT id)::NUMERIC) * 100
         ELSE 0 END
       FROM m_employees e
       LEFT JOIN t_kpi_assessments a ON e.id = a.employee_id AND a.period = to_char(NOW(), 'YYYY-MM')
       WHERE e.is_active = true
      ) as completion_rate
  ),
  prev_stats AS (
    SELECT 
      (SELECT COALESCE(AVG(score), 0) FROM t_kpi_assessments 
       WHERE period = to_char(NOW() - interval '1 month', 'YYYY-MM')) as prev_avg_score,
       (SELECT COUNT(*) FROM m_employees WHERE is_active = true AND created_at < current_month_start) as prev_total_employees
  )
  SELECT 
    cs.total_employees,
    cs.total_units,
    curr_avg_score.avg_score_val,
    cs.completion_rate,
    CASE WHEN ps.prev_total_employees > 0 THEN ((cs.total_employees - ps.prev_total_employees)::NUMERIC / ps.prev_total_employees::NUMERIC) * 100 ELSE 0 END as emp_trend,
    CASE WHEN ps.prev_avg_score > 0 THEN ((cs.avg_score - ps.prev_avg_score) / ps.prev_avg_score) * 100 ELSE 0 END as score_trend,
    0::NUMERIC as completion_trend
  FROM current_stats cs, prev_stats ps, 
  (SELECT cs_inner.avg_score as avg_score_val FROM current_stats cs_inner) curr_avg_score;
END;
$$;

-- 2. Function to get top performers
CREATE OR REPLACE FUNCTION get_top_performers(performer_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  unit_name TEXT,
  avg_score NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as employee_id,
    e.full_name as employee_name,
    u.name as unit_name,
    AVG(a.score) as avg_score
  FROM m_employees e
  INNER JOIN m_units u ON u.id = e.unit_id
  INNER JOIN t_kpi_assessments a ON a.employee_id = e.id
  WHERE e.is_active = true AND u.is_active = true
    AND a.period = to_char(NOW(), 'YYYY-MM')
  GROUP BY e.id, e.full_name, u.name
  ORDER BY AVG(a.score) DESC
  LIMIT performer_limit;
END;
$$;

-- 3. Function to get unit performance stats
CREATE OR REPLACE FUNCTION get_unit_performance_stats()
RETURNS TABLE (
  unit_id UUID,
  unit_name TEXT,
  employee_count BIGINT,
  avg_score NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as unit_id,
    u.name as unit_name,
    COUNT(DISTINCT e.id) as employee_count,
    COALESCE(AVG(a.score), 0) as avg_score
  FROM m_units u
  LEFT JOIN m_employees e ON e.unit_id = u.id AND e.is_active = true
  LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id AND a.period = to_char(NOW(), 'YYYY-MM')
  WHERE u.is_active = true
  GROUP BY u.id, u.name
  ORDER BY u.name;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_dashboard_stats_optimized() TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_performers(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unit_performance_stats() TO authenticated;
