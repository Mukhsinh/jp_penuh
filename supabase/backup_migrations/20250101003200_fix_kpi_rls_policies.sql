-- ============================================
-- FIX KPI RLS POLICIES
-- Memperbaiki RLS policies untuk m_kpi_categories dan m_kpi_indicators
-- agar superadmin dapat melakukan INSERT/UPDATE/DELETE
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Superadmin full access to kpi categories" ON m_kpi_categories;
DROP POLICY IF EXISTS "Unit managers can view their unit's categories" ON m_kpi_categories;
DROP POLICY IF EXISTS "Employees can view their unit's categories" ON m_kpi_categories;
DROP POLICY IF EXISTS "Superadmin full access to indicators" ON m_kpi_indicators;
DROP POLICY IF EXISTS "Unit managers can view their unit's indicators" ON m_kpi_indicators;
DROP POLICY IF EXISTS "Employees can view their unit's indicators" ON m_kpi_indicators;

-- ============================================
-- RLS POLICIES: m_kpi_categories
-- ============================================

-- Superadmin can do everything
CREATE POLICY "Superadmin full access to kpi categories"
  ON m_kpi_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM m_employees 
      WHERE user_id = auth.uid() 
      AND role = 'superadmin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM m_employees 
      WHERE user_id = auth.uid() 
      AND role = 'superadmin'
      AND is_active = true
    )
  );

-- Unit managers can view their unit's categories
CREATE POLICY "Unit managers can view their unit's categories"
  ON m_kpi_categories 
  FOR SELECT
  TO authenticated
  USING (
    unit_id IN (
      SELECT unit_id FROM m_employees 
      WHERE user_id = auth.uid() 
      AND role = 'unit_manager'
      AND is_active = true
    )
  );

-- Employees can view their unit's categories
CREATE POLICY "Employees can view their unit's categories"
  ON m_kpi_categories 
  FOR SELECT
  TO authenticated
  USING (
    unit_id IN (
      SELECT unit_id FROM m_employees 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

-- ============================================
-- RLS POLICIES: m_kpi_indicators
-- ============================================

-- Superadmin can do everything
CREATE POLICY "Superadmin full access to indicators"
  ON m_kpi_indicators
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM m_employees 
      WHERE user_id = auth.uid() 
      AND role = 'superadmin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM m_employees 
      WHERE user_id = auth.uid() 
      AND role = 'superadmin'
      AND is_active = true
    )
  );

-- Unit managers can view their unit's indicators
CREATE POLICY "Unit managers can view their unit's indicators"
  ON m_kpi_indicators 
  FOR SELECT
  TO authenticated
  USING (
    category_id IN (
      SELECT c.id FROM m_kpi_categories c
      INNER JOIN m_employees e ON c.unit_id = e.unit_id
      WHERE e.user_id = auth.uid() 
      AND e.role = 'unit_manager'
      AND e.is_active = true
    )
  );

-- Employees can view their unit's indicators
CREATE POLICY "Employees can view their unit's indicators"
  ON m_kpi_indicators 
  FOR SELECT
  TO authenticated
  USING (
    category_id IN (
      SELECT c.id FROM m_kpi_categories c
      INNER JOIN m_employees e ON c.unit_id = e.unit_id
      WHERE e.user_id = auth.uid() 
      AND e.is_active = true
    )
  );

-- ============================================
-- VERIFY POLICIES
-- ============================================

-- Check if policies are created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename IN ('m_kpi_categories', 'm_kpi_indicators')
ORDER BY tablename, policyname;
