-- ============================================
-- Fix m_employees RLS Policies
-- Remove policies that access auth.users directly and use RLS functions
-- ============================================

-- Drop all existing policies on m_employees
DROP POLICY IF EXISTS "Users can view their own employee record" ON m_employees;
DROP POLICY IF EXISTS "Superadmin can view all employees" ON m_employees;
DROP POLICY IF EXISTS "Users can update their own record" ON m_employees;
DROP POLICY IF EXISTS "Superadmin full access to employees" ON m_employees;
DROP POLICY IF EXISTS "Unit managers can view employees in their unit" ON m_employees;
DROP POLICY IF EXISTS "Unit managers can view unit employees" ON m_employees;
DROP POLICY IF EXISTS "Authenticated users employee access" ON m_employees;
DROP POLICY IF EXISTS "Employees can view their own record" ON m_employees;

-- Create clean, simple policies using RLS functions
CREATE POLICY "Superadmin full access to employees"
  ON m_employees FOR ALL
  TO authenticated
  USING (is_superadmin());

CREATE POLICY "Unit managers can view their unit employees"
  ON m_employees FOR SELECT
  TO authenticated
  USING (
    is_unit_manager() AND unit_id = get_user_unit_id()
  );

CREATE POLICY "Employees can view their own record"
  ON m_employees FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own record"
  ON m_employees FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());