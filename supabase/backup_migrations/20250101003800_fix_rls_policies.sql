-- ============================================
-- Fix RLS Policies for KPI Configuration
-- ============================================

-- Drop existing helper functions
DROP FUNCTION IF EXISTS get_current_employee();
DROP FUNCTION IF EXISTS is_superadmin();
DROP FUNCTION IF EXISTS get_user_unit_id();
DROP FUNCTION IF EXISTS is_unit_manager();

-- Recreate helper functions with proper auth handling
CREATE OR REPLACE FUNCTION get_current_employee()
RETURNS UUID AS $$
  SELECT id FROM m_employees 
  WHERE email = auth.email() 
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM m_employees 
    WHERE email = auth.email()
    AND role = 'superadmin'
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_unit_id()
RETURNS UUID AS $$
  SELECT unit_id FROM m_employees 
  WHERE email = auth.email()
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_unit_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM m_employees 
    WHERE email = auth.email()
    AND role = 'unit_manager'
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Drop and recreate RLS policies for m_kpi_categories
DROP POLICY IF EXISTS "Superadmin full access to kpi categories" ON m_kpi_categories;
DROP POLICY IF EXISTS "Unit managers can view their unit's categories" ON m_kpi_categories;
DROP POLICY IF EXISTS "Employees can view their unit's categories" ON m_kpi_categories;

CREATE POLICY "Superadmin full access to kpi categories"
  ON m_kpi_categories FOR ALL
  TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Unit managers can view their unit's categories"
  ON m_kpi_categories FOR SELECT
  TO authenticated
  USING (unit_id = get_user_unit_id());

CREATE POLICY "Employees can view their unit's categories"
  ON m_kpi_categories FOR SELECT
  TO authenticated
  USING (unit_id = get_user_unit_id());

-- Drop and recreate RLS policies for m_kpi_indicators
DROP POLICY IF EXISTS "Superadmin full access to indicators" ON m_kpi_indicators;
DROP POLICY IF EXISTS "Unit managers can view their unit's indicators" ON m_kpi_indicators;
DROP POLICY IF EXISTS "Employees can view their unit's indicators" ON m_kpi_indicators;

CREATE POLICY "Superadmin full access to indicators"
  ON m_kpi_indicators FOR ALL
  TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Unit managers can view their unit's indicators"
  ON m_kpi_indicators FOR SELECT
  TO authenticated
  USING (
    category_id IN (
      SELECT id FROM m_kpi_categories WHERE unit_id = get_user_unit_id()
    )
  );

CREATE POLICY "Employees can view their unit's indicators"
  ON m_kpi_indicators FOR SELECT
  TO authenticated
  USING (
    category_id IN (
      SELECT id FROM m_kpi_categories WHERE unit_id = get_user_unit_id()
    )
  );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON m_kpi_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON m_kpi_indicators TO authenticated;
