-- Fix RLS helper functions to use auth.users.user_metadata instead of m_employees.role
-- This migration fixes the 500 error on pool page and other authenticated pages

-- 1. Fix is_superadmin() function
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin',
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix is_unit_manager() function
CREATE OR REPLACE FUNCTION is_unit_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'unit_manager',
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix is_employee() function (create if not exists)
CREATE OR REPLACE FUNCTION is_employee()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'employee',
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. get_user_unit_id() is fine as it only reads from m_employees
-- No changes needed for this function

-- 5. Create helper function to get user role from metadata
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (auth.jwt() -> 'user_metadata' ->> 'role');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_superadmin() IS 'Check if current user is superadmin using auth.users.user_metadata';
COMMENT ON FUNCTION is_unit_manager() IS 'Check if current user is unit_manager using auth.users.user_metadata';
COMMENT ON FUNCTION is_employee() IS 'Check if current user is employee using auth.users.user_metadata';
COMMENT ON FUNCTION get_user_role() IS 'Get current user role from auth.users.user_metadata';
