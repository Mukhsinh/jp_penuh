-- Fix RLS policies for assessment employees access
-- This migration fixes the issue where employee data is not showing in assessment page

-- Drop existing problematic function and policies
DROP POLICY IF EXISTS assessment_access_policy ON t_kpi_assessments;
DROP FUNCTION IF EXISTS can_assess_employee(UUID);

-- Create improved function to check employee access using auth.uid()
CREATE OR REPLACE FUNCTION can_assess_employee(employee_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_employee m_employees%ROWTYPE;
  target_employee m_employees%ROWTYPE;
BEGIN
  -- Get current user's employee data using auth.uid()
  SELECT * INTO current_user_employee 
  FROM m_employees 
  WHERE user_id = auth.uid() 
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policies for m_employees table
-- This is the critical missing piece that was causing the issue

-- Policy for superadmin: can see all employees
CREATE POLICY employees_superadmin_policy ON m_employees
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM m_employees e 
      WHERE e.user_id = auth.uid() 
      AND e.role = 'superadmin' 
      AND e.is_active = true
    )
  );

-- Policy for unit managers: can only see employees in their unit
CREATE POLICY employees_unit_manager_policy ON m_employees
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM m_employees manager 
      WHERE manager.user_id = auth.uid() 
      AND manager.role = 'unit_manager' 
      AND manager.unit_id = m_employees.unit_id
      AND manager.is_active = true
    )
  );

-- Policy for employees: can only see themselves
CREATE POLICY employees_self_policy ON m_employees
  FOR ALL 
  USING (user_id = auth.uid());

-- Re-create assessment access policy with improved function
CREATE POLICY assessment_access_policy ON t_kpi_assessments
  FOR ALL USING (can_assess_employee(employee_id));

-- Add RLS policy for v_assessment_status view access
-- Create a function to check if user can view assessment status
CREATE OR REPLACE FUNCTION can_view_assessment_status()
RETURNS BOOLEAN AS $$
DECLARE
  current_user_employee m_employees%ROWTYPE;
BEGIN
  -- Get current user's employee data
  SELECT * INTO current_user_employee 
  FROM m_employees 
  WHERE user_id = auth.uid() 
  AND is_active = true;
  
  -- If no employee record found, deny access
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Superadmin and unit managers can view assessment status
  IF current_user_employee.role IN ('superadmin', 'unit_manager') THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION can_assess_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_assessment_status() TO authenticated;

-- Refresh the view to ensure it uses the new policies
DROP VIEW IF EXISTS v_assessment_status;
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
  AND can_view_assessment_status() -- Add access control to view
GROUP BY e.id, e.full_name, e.unit_id, u.name, p.period
ORDER BY e.full_name, p.period DESC;

-- Grant view access
GRANT SELECT ON v_assessment_status TO authenticated;