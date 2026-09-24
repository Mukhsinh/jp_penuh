-- Optimized dashboard functions for better performance
-- Created for Vercel deployment optimization

-- Function to get aggregated dashboard stats in single query
CREATE OR REPLACE FUNCTION get_dashboard_aggregated_stats(
  target_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
  target_month INTEGER DEFAULT EXTRACT(MONTH FROM NOW())
)
RETURNS TABLE (
  total_units BIGINT,
  total_employees BIGINT,
  avg_score NUMERIC,
  completion_rate NUMERIC,
  active_pools BIGINT,
  total_pool_amount NUMERIC,
  total_indicators BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT 
      (SELECT COUNT(*) FROM m_units WHERE is_active = true) as unit_count,
      (SELECT COUNT(*) FROM m_employees WHERE is_active = true) as employee_count,
      (SELECT COALESCE(AVG(total_score), 0) FROM t_realizations WHERE EXTRACT(YEAR FROM created_at) = target_year AND EXTRACT(MONTH FROM created_at) = target_month) as avg_total_score,
      (SELECT COUNT(*) FROM t_pools WHERE year = target_year AND month = target_month) as pool_count,
      (SELECT COALESCE(SUM(total_amount), 0) FROM t_pools WHERE year = target_year AND month = target_month) as pool_amount,
      (SELECT COUNT(*) FROM m_kpi_indicators WHERE is_active = true) as indicator_count
  )
  SELECT 
    s.unit_count,
    s.employee_count,
    s.avg_total_score,
    CASE 
      WHEN s.employee_count > 0 THEN (s.employee_count::NUMERIC / s.employee_count::NUMERIC) * 100
      ELSE 0
    END as completion_rate,
    s.pool_count,
    s.pool_amount,
    s.indicator_count
  FROM stats s;
END;
$$;

-- Optimized function to get dashboard stats with trends
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
  current_month INTEGER := EXTRACT(MONTH FROM NOW());
  current_year INTEGER := EXTRACT(YEAR FROM NOW());
  prev_month INTEGER;
  prev_year INTEGER;
BEGIN
  -- Calculate previous month
  IF current_month = 1 THEN
    prev_month := 12;
    prev_year := current_year - 1;
  ELSE
    prev_month := current_month - 1;
    prev_year := current_year;
  END IF;

  RETURN QUERY
  WITH current_stats AS (
    SELECT 
      COUNT(DISTINCT me.id) as curr_employees,
      COUNT(DISTINCT me.unit_id) as curr_units,
      COALESCE(AVG(tr.total_score), 0) as curr_avg_score,
      CASE 
        WHEN COUNT(DISTINCT me.id) > 0 THEN 
          (COUNT(DISTINCT tr.employee_id)::NUMERIC / COUNT(DISTINCT me.id)::NUMERIC) * 100
        ELSE 0
      END as curr_completion
    FROM m_employees me
    LEFT JOIN t_realizations tr ON me.id = tr.employee_id 
      AND EXTRACT(YEAR FROM tr.created_at) = current_year 
      AND EXTRACT(MONTH FROM tr.created_at) = current_month
    WHERE me.is_active = true
  ),
  prev_stats AS (
    SELECT 
      COUNT(DISTINCT me.id) as prev_employees,
      COALESCE(AVG(tr.total_score), 0) as prev_avg_score,
      CASE 
        WHEN COUNT(DISTINCT me.id) > 0 THEN 
          (COUNT(DISTINCT tr.employee_id)::NUMERIC / COUNT(DISTINCT me.id)::NUMERIC) * 100
        ELSE 0
      END as prev_completion
    FROM m_employees me
    LEFT JOIN t_realizations tr ON me.id = tr.employee_id 
      AND EXTRACT(YEAR FROM tr.created_at) = prev_year 
      AND EXTRACT(MONTH FROM tr.created_at) = prev_month
    WHERE me.is_active = true
  )
  SELECT 
    cs.curr_employees,
    cs.curr_units,
    cs.curr_avg_score,
    cs.curr_completion,
    -- Trends (percentage change)
    CASE 
      WHEN ps.prev_employees > 0 THEN 
        ((cs.curr_employees - ps.prev_employees)::NUMERIC / ps.prev_employees::NUMERIC) * 100
      ELSE 0
    END as emp_trend,
    CASE 
      WHEN ps.prev_avg_score > 0 THEN 
        ((cs.curr_avg_score - ps.prev_avg_score) / ps.prev_avg_score) * 100
      ELSE 0
    END as score_trend,
    CASE 
      WHEN ps.prev_completion > 0 THEN 
        ((cs.curr_completion - ps.prev_completion) / ps.prev_completion) * 100
      ELSE 0
    END as comp_trend
  FROM current_stats cs, prev_stats ps;
END;
$$;

-- Function to get top performers efficiently
CREATE OR REPLACE FUNCTION get_top_performers(
  limit_count INTEGER DEFAULT 5,
  target_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
  target_month INTEGER DEFAULT EXTRACT(MONTH FROM NOW())
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  unit TEXT,
  score NUMERIC,
  rank BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    me.id,
    me.full_name as name,
    mu.name as unit,
    tr.total_score as score,
    ROW_NUMBER() OVER (ORDER BY tr.total_score DESC) as rank
  FROM m_employees me
  JOIN m_units mu ON me.unit_id = mu.id
  JOIN t_realizations tr ON me.id = tr.employee_id
  WHERE me.is_active = true
    AND EXTRACT(YEAR FROM tr.created_at) = target_year
    AND EXTRACT(MONTH FROM tr.created_at) = target_month
    AND tr.total_score > 0
  ORDER BY tr.total_score DESC
  LIMIT limit_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_dashboard_aggregated_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_performers TO authenticated;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_realizations_date_employee ON t_realizations(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_realizations_year_month ON t_realizations(EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at));
CREATE INDEX IF NOT EXISTS idx_pools_year_month ON t_pools(year, month);
CREATE INDEX IF NOT EXISTS idx_employees_active_unit ON m_employees(is_active, unit_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_units_active ON m_units(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kpi_indicators_active ON m_kpi_indicators(is_active) WHERE is_active = true;