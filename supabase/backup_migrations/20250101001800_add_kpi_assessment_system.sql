-- ============================================
-- KPI Assessment System Migration
-- ============================================

-- Create KPI Assessments table
CREATE TABLE IF NOT EXISTS t_kpi_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  realization_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  target_value DECIMAL(15,2) NOT NULL, -- Denormalized for calculation
  weight_percentage DECIMAL(5,2) NOT NULL, -- Denormalized for calculation
  achievement_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN target_value > 0 THEN ROUND((realization_value / target_value * 100)::numeric, 2)
      ELSE 0 
    END
  ) STORED,
  score DECIMAL(10,2) GENERATED ALWAYS AS (
    CASE 
      WHEN target_value > 0 AND (realization_value / target_value * 100) >= 100 THEN weight_percentage
      WHEN target_value > 0 THEN ROUND((realization_value / target_value * weight_percentage / 100)::numeric, 2)
      ELSE 0 
    END
  ) STORED,
  notes TEXT,
  assessor_id UUID NOT NULL REFERENCES m_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, indicator_id, period)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessments_employee_period ON t_kpi_assessments(employee_id, period);
CREATE INDEX IF NOT EXISTS idx_assessments_period ON t_kpi_assessments(period);
CREATE INDEX IF NOT EXISTS idx_assessments_assessor ON t_kpi_assessments(assessor_id);
CREATE INDEX IF NOT EXISTS idx_assessments_indicator ON t_kpi_assessments(indicator_id);

-- Enable RLS
ALTER TABLE t_kpi_assessments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user can assess employee
CREATE OR REPLACE FUNCTION can_assess_employee(employee_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Get current user's employee record
  DECLARE
    current_user_employee m_employees%ROWTYPE;
    target_employee m_employees%ROWTYPE;
  BEGIN
    -- Get current user's employee data
    SELECT * INTO current_user_employee 
    FROM m_employees 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true;
    
    -- If no employee record found, deny access
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
    
    -- Superadmin can assess anyone
    IF current_user_employee.role = 'superadmin' THEN
      RETURN TRUE;
    END IF;
    
    -- Unit managers can only assess employees in their unit
    IF current_user_employee.role = 'unit_manager' THEN
      SELECT * INTO target_employee 
      FROM m_employees 
      WHERE id = employee_uuid;
      
      IF FOUND AND target_employee.unit_id = current_user_employee.unit_id THEN
        RETURN TRUE;
      END IF;
    END IF;
    
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for t_kpi_assessments
CREATE POLICY assessment_access_policy ON t_kpi_assessments
  FOR ALL USING (can_assess_employee(employee_id));

-- Create assessment status view
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
  WHERE status IN ('approved', 'distributed')
  ORDER BY period DESC
  LIMIT 12 -- Last 12 months
) p
LEFT JOIN m_kpi_categories c ON c.unit_id = e.unit_id AND c.is_active = true
LEFT JOIN m_kpi_indicators i ON i.category_id = c.id AND i.is_active = true
LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id 
  AND a.indicator_id = i.id 
  AND a.period = p.period
WHERE e.is_active = true
GROUP BY e.id, e.full_name, e.unit_id, u.name, p.period
ORDER BY e.full_name, p.period DESC;

-- Add updated_at trigger for assessments
CREATE TRIGGER update_t_kpi_assessments_updated_at 
  BEFORE UPDATE ON t_kpi_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON t_kpi_assessments TO authenticated;
GRANT SELECT ON v_assessment_status TO authenticated;
GRANT EXECUTE ON FUNCTION can_assess_employee(UUID) TO authenticated;