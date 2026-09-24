-- Fix RLS policies for m_kpi_sub_indicators to avoid "permission denied for table users" error
-- The issue is that policies were trying to access auth.users table directly
-- We need to use only m_employees table which is accessible via RLS

-- Drop existing policies
DROP POLICY IF EXISTS "Superadmin full access to sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Unit manager view sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Employee view sub indicators" ON m_kpi_sub_indicators;

-- Create corrected RLS policies using only m_employees table

-- Superadmin: Full access to all sub indicators
CREATE POLICY "Superadmin full access to sub indicators" ON m_kpi_sub_indicators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM m_employees 
      WHERE m_employees.user_id = auth.uid() 
      AND m_employees.role = 'superadmin'
      AND m_employees.is_active = true
    )
  );

-- Unit Manager: Can view and manage sub indicators for their unit only
CREATE POLICY "Unit manager access sub indicators" ON m_kpi_sub_indicators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM m_employees e
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE e.user_id = auth.uid() 
      AND e.role = 'unit_manager'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );

-- Employee: Can view sub indicators for their unit only
CREATE POLICY "Employee view sub indicators" ON m_kpi_sub_indicators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM m_employees e
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE e.user_id = auth.uid() 
      AND e.role = 'employee'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );