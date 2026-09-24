-- Fix RLS policies untuk m_kpi_sub_indicators dengan auth yang benar

-- Drop existing policies
DROP POLICY IF EXISTS "Superadmin full access to sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Unit manager view sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Employee view sub indicators" ON m_kpi_sub_indicators;

-- Helper function untuk check superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check dari auth.users metadata
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'role' = 'superadmin'
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check dari m_employees table jika ada
  IF EXISTS (
    SELECT 1 FROM m_employees e
    JOIN auth.users u ON u.email = e.email
    WHERE u.id = auth.uid()
    AND e.role = 'superadmin'
    AND e.is_active = true
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Superadmin: Full access to all sub indicators
CREATE POLICY "Superadmin full access to sub indicators" ON m_kpi_sub_indicators
  FOR ALL USING (is_superadmin());

-- Unit Manager: Can view sub indicators for their unit only
CREATE POLICY "Unit manager view sub indicators" ON m_kpi_sub_indicators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN m_employees e ON e.email = u.email
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE u.id = auth.uid()
      AND e.role = 'unit_manager'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );

-- Employee: Can view sub indicators for their unit only
CREATE POLICY "Employee view sub indicators" ON m_kpi_sub_indicators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN m_employees e ON e.email = u.email
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE u.id = auth.uid()
      AND e.role = 'employee'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );