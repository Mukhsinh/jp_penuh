-- ============================================
-- Fix RLS Helper Functions
-- Using user_id instead of email
-- ============================================

CREATE OR REPLACE FUNCTION get_current_employee()
RETURNS UUID AS $$
  SELECT id FROM m_employees 
  WHERE user_id = auth.uid()
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM m_employees 
    WHERE user_id = auth.uid()
    AND role = 'superadmin'
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_unit_id()
RETURNS UUID AS $$
  SELECT unit_id FROM m_employees 
  WHERE user_id = auth.uid()
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_unit_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM m_employees 
    WHERE user_id = auth.uid()
    AND role = 'unit_manager'
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
