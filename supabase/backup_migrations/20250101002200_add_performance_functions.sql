-- Performance optimization functions for dashboard
-- These functions reduce N+1 queries by using database aggregation

-- Function to get unit performance stats in single query
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
  LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id
  WHERE u.is_active = true
  GROUP BY u.id, u.name
  ORDER BY u.name;
END;
$$;

-- Function to get top performers with database aggregation
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
  GROUP BY e.id, e.full_name, u.name
  HAVING COUNT(a.id) > 0
  ORDER BY AVG(a.score) DESC
  LIMIT performer_limit;
END;
$$;

-- Add indexes for better performance (skip notifications table if not exists)
CREATE INDEX IF NOT EXISTS idx_kpi_assessments_employee_score ON t_kpi_assessments(employee_id, score);
CREATE INDEX IF NOT EXISTS idx_employees_unit_active ON m_employees(unit_id, is_active);
CREATE INDEX IF NOT EXISTS idx_settings_key ON t_settings(key);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_unit_performance_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_performers(INTEGER) TO authenticated;