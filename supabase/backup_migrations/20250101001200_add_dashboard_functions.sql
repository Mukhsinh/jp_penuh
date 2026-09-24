-- Database functions untuk optimasi dashboard performance

-- Function untuk mendapatkan dashboard stats dalam satu query
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE (
  total_employees bigint,
  total_units bigint,
  avg_score numeric,
  completion_rate numeric,
  employee_trend numeric,
  score_trend numeric,
  completion_trend numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT 
      (SELECT COUNT(*) FROM m_employees WHERE is_active = true) as emp_count,
      (SELECT COUNT(*) FROM m_units WHERE is_active = true) as unit_count,
      (SELECT AVG(score) FROM t_kpi_assessments WHERE score IS NOT NULL) as avg_sc,
      (SELECT COUNT(DISTINCT employee_id) FROM t_kpi_assessments) as assessed_count
  )
  SELECT 
    s.emp_count,
    s.unit_count,
    COALESCE(s.avg_sc, 0),
    CASE 
      WHEN s.emp_count > 0 THEN (s.assessed_count::numeric / s.emp_count::numeric) * 100
      ELSE 0
    END,
    5.2::numeric, -- placeholder trends
    3.1::numeric,
    12.5::numeric
  FROM stats s;
END;
$$;

-- Function untuk top performers dengan aggregation
CREATE OR REPLACE FUNCTION get_top_performers(performer_limit integer DEFAULT 5)
RETURNS TABLE (
  employee_id text,
  employee_name text,
  unit_name text,
  avg_score numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.full_name,
    u.name,
    AVG(a.score) as avg_score
  FROM t_kpi_assessments a
  JOIN m_employees e ON a.employee_id = e.id
  LEFT JOIN m_units u ON e.unit_id = u.id
  WHERE a.score IS NOT NULL
    AND e.is_active = true
  GROUP BY e.id, e.full_name, u.name
  HAVING COUNT(a.score) >= 1
  ORDER BY avg_score DESC
  LIMIT performer_limit;
END;
$$;

-- Function untuk unit performance
CREATE OR REPLACE FUNCTION get_unit_performance()
RETURNS TABLE (
  unit_id text,
  unit_name text,
  employee_count bigint,
  avg_score numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.name,
    COUNT(DISTINCT e.id) as emp_count,
    COALESCE(AVG(a.score), 0) as avg_sc
  FROM m_units u
  LEFT JOIN m_employees e ON u.id = e.unit_id AND e.is_active = true
  LEFT JOIN t_kpi_assessments a ON e.id = a.employee_id
  WHERE u.is_active = true
  GROUP BY u.id, u.name
  ORDER BY avg_sc DESC;
END;
$$;

-- Function untuk performance trend (6 bulan terakhir)
CREATE OR REPLACE FUNCTION get_performance_trend(months_back integer DEFAULT 6)
RETURNS TABLE (
  month_year text,
  p1_avg numeric,
  p2_avg numeric,
  p3_avg numeric,
  total_avg numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_date date;
  end_date date;
  current_month date;
BEGIN
  current_month := date_trunc('month', CURRENT_DATE);
  
  FOR i IN 0..(months_back - 1) LOOP
    start_date := current_month - (i || ' months')::interval;
    end_date := start_date + '1 month'::interval - '1 day'::interval;
    
    RETURN QUERY
    WITH monthly_data AS (
      SELECT 
        kc.category,
        AVG(a.score) as avg_score
      FROM t_kpi_assessments a
      JOIN m_kpi_indicators ki ON a.indicator_id = ki.id
      JOIN m_kpi_categories kc ON ki.category_id = kc.id
      WHERE a.created_at >= start_date 
        AND a.created_at <= end_date
        AND a.score IS NOT NULL
      GROUP BY kc.category
    )
    SELECT 
      to_char(start_date, 'Mon') as month_name,
      COALESCE((SELECT avg_score FROM monthly_data WHERE category = 'P1'), 0),
      COALESCE((SELECT avg_score FROM monthly_data WHERE category = 'P2'), 0),
      COALESCE((SELECT avg_score FROM monthly_data WHERE category = 'P3'), 0),
      COALESCE((SELECT AVG(avg_score) FROM monthly_data), 0);
  END LOOP;
END;
$$;