-- Fix RLS policies for m_kpi_sub_indicators to use auth.users instead of m_employees

-- Drop existing policies
DROP POLICY IF EXISTS "Superadmin full access to sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Unit manager view sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Employee view sub indicators" ON m_kpi_sub_indicators;

-- Superadmin: Full access to all sub indicators
CREATE POLICY "Superadmin full access to sub indicators" ON m_kpi_sub_indicators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Unit Manager: Can view sub indicators for their unit only
CREATE POLICY "Unit manager view sub indicators" ON m_kpi_sub_indicators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN m_employees e ON e.user_id = u.id
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE u.id = auth.uid() 
      AND u.raw_user_meta_data->>'role' = 'unit_manager'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );

-- Employee: Can view sub indicators for their unit only
CREATE POLICY "Employee view sub indicators" ON m_kpi_sub_indicators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN m_employees e ON e.user_id = u.id
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE u.id = auth.uid() 
      AND u.raw_user_meta_data->>'role' = 'employee'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );