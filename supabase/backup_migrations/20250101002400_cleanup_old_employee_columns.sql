-- ============================================
-- Cleanup Old Employee Columns
-- IMPORTANT: Only run this AFTER verifying migration is successful
-- ============================================

-- WARNING: This migration is DESTRUCTIVE and cannot be easily reversed
-- Make sure to:
-- 1. Backup your database before running
-- 2. Verify all employees have user_id populated
-- 3. Verify all auth.users have corresponding employee records
-- 4. Test login with migrated users
-- 5. Verify RLS policies work correctly

-- Step 1: Verify all employees have user_id (safety check)
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM m_employees
  WHERE user_id IS NULL;
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot proceed: % employees have NULL user_id. Run migration first.', v_count;
  END IF;
  
  RAISE NOTICE 'Safety check passed: All employees have user_id';
END $$;

-- Step 2: Drop temporary email index
DROP INDEX IF EXISTS idx_employees_email_temp;

-- Step 3: Drop email column from m_employees
ALTER TABLE m_employees DROP COLUMN IF EXISTS email;

-- Step 4: Drop role column from m_employees
ALTER TABLE m_employees DROP COLUMN IF EXISTS role;

-- Step 5: Make user_id NOT NULL (enforce referential integrity)
ALTER TABLE m_employees ALTER COLUMN user_id SET NOT NULL;

-- Step 6: Update foreign key constraint to CASCADE on delete
ALTER TABLE m_employees DROP CONSTRAINT IF EXISTS m_employees_user_id_fkey;
ALTER TABLE m_employees ADD CONSTRAINT m_employees_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 7: Update audit table foreign keys
ALTER TABLE t_audit_log DROP CONSTRAINT IF EXISTS t_audit_log_user_id_fkey;
ALTER TABLE t_audit_log ADD CONSTRAINT t_audit_log_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE t_auth_log DROP CONSTRAINT IF EXISTS t_auth_log_user_id_fkey;
ALTER TABLE t_auth_log ADD CONSTRAINT t_auth_log_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 8: Update notification table foreign key
ALTER TABLE t_notification DROP CONSTRAINT IF EXISTS t_notification_user_id_fkey;
ALTER TABLE t_notification ADD CONSTRAINT t_notification_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES m_employees(id) ON DELETE CASCADE;

-- Step 9: Update settings table foreign key
ALTER TABLE t_settings DROP CONSTRAINT IF EXISTS t_settings_updated_by_fkey;
ALTER TABLE t_settings ADD CONSTRAINT t_settings_updated_by_fkey 
  FOREIGN KEY (updated_by) REFERENCES m_employees(id) ON DELETE SET NULL;

-- Step 10: Update pool table foreign key
ALTER TABLE t_pool DROP CONSTRAINT IF EXISTS t_pool_approved_by_fkey;
ALTER TABLE t_pool ADD CONSTRAINT t_pool_approved_by_fkey 
  FOREIGN KEY (approved_by) REFERENCES m_employees(id) ON DELETE SET NULL;

-- Step 11: Add comments to document the new structure
COMMENT ON COLUMN m_employees.user_id IS 'References auth.users.id - primary link to authentication';
COMMENT ON TABLE m_employees IS 'Employee master data - authentication handled by auth.users';

-- Step 12: Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Cleanup complete: email and role columns removed from m_employees';
  RAISE NOTICE 'user_id is now NOT NULL and properly constrained';
  RAISE NOTICE 'All foreign keys updated to reference correct tables';
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these queries to verify the cleanup was successful:
--
-- 1. Verify m_employees structure:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'm_employees' 
-- ORDER BY ordinal_position;
--
-- 2. Verify all employees have auth users:
-- SELECT COUNT(*) as total_employees,
--        COUNT(user_id) as employees_with_user_id
-- FROM m_employees;
--
-- 3. Verify foreign key constraints:
-- SELECT conname, conrelid::regclass, confrelid::regclass
-- FROM pg_constraint
-- WHERE conrelid = 'm_employees'::regclass
-- AND contype = 'f';
-- ============================================
