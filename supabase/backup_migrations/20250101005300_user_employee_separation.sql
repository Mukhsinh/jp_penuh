-- ============================================
-- User-Employee Separation Migration
-- Migrates from m_employees-based auth to Supabase Auth
-- ============================================

-- Step 1: Add user_id column to m_employees (nullable initially for safe migration)
ALTER TABLE m_employees 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create unique index on user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user_id ON m_employees(user_id);

-- Step 3: Update helper functions to use auth.uid() instead of email lookup

-- Get current employee using auth.uid()
CREATE OR REPLACE FUNCTION get_current_employee()
RETURNS UUID AS $$
  SELECT id FROM m_employees WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Check if user is superadmin using user_metadata
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin',
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Get user's unit_id using auth.uid()
CREATE OR REPLACE FUNCTION get_user_unit_id()
RETURNS UUID AS $$
  SELECT unit_id FROM m_employees WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Check if user is unit manager using user_metadata
CREATE OR REPLACE FUNCTION is_unit_manager()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'unit_manager',
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Step 4: Update audit and auth log tables to support auth.users

-- Update t_audit_log to make user_id nullable (will reference auth.users after cleanup)
ALTER TABLE t_audit_log 
ALTER COLUMN user_id DROP NOT NULL;

-- Add comment to clarify the transition
COMMENT ON COLUMN t_audit_log.user_id IS 'References auth.users.id after migration';

-- Update t_auth_log to make user_id nullable
ALTER TABLE t_auth_log 
ALTER COLUMN user_id DROP NOT NULL;

-- Add comment to clarify the transition
COMMENT ON COLUMN t_auth_log.user_id IS 'References auth.users.id after migration';

-- Step 5: Update t_notification to support new structure
-- (Already references m_employees, will work through user_id link)

-- Step 6: Update t_settings updated_by to support new structure
-- (Already references m_employees, will work through user_id link)

-- Step 7: Create helper function to get employee_id from auth.uid()
CREATE OR REPLACE FUNCTION get_employee_id_from_auth()
RETURNS UUID AS $$
  SELECT id FROM m_employees WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Step 8: Create helper function to get user metadata
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    'employee'
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Step 9: Add index for performance on email (temporary, will be removed after migration)
CREATE INDEX IF NOT EXISTS idx_employees_email_temp ON m_employees(email);

-- ============================================
-- NOTES FOR MIGRATION EXECUTION
-- ============================================
-- 
-- After running this migration:
-- 1. Run the data migration script (scripts/migrate-users-to-auth.ts)
-- 2. Verify all employees have user_id populated
-- 3. Run cleanup migration to:
--    - Make user_id NOT NULL
--    - Drop email and role columns from m_employees
--    - Drop temporary email index
-- 
-- Rollback plan:
-- - Keep email and role columns until verification complete
-- - Can revert helper functions if needed
-- - user_id column can be dropped if migration fails
-- ============================================
