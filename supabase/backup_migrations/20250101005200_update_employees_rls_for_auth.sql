-- ============================================
-- Update m_employees RLS Policies for Auth.users
-- Updates RLS policies to use user_id instead of email
-- ============================================

-- Drop old policies that use email
DROP POLICY IF EXISTS "Users can update their own record" ON m_employees;
DROP POLICY IF EXISTS "Authenticated users can view all employees" ON m_employees;

-- Recreate policies using user_id and auth.uid()

-- Policy: Authenticated users can view all employees
CREATE POLICY "Authenticated users can view all employees"
ON m_employees
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Policy: Users can update their own record
CREATE POLICY "Users can update their own record"
ON m_employees
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Superadmin policy remains unchanged (already uses is_superadmin())
-- No changes needed for "Superadmin full access to employees" policy

-- Add comment
COMMENT ON TABLE m_employees IS 'Employee master data with RLS policies using auth.uid()';
