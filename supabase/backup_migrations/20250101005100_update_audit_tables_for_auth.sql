-- ============================================
-- Update Audit Tables for Auth.users Integration
-- Updates audit and auth log tables to reference auth.users.id
-- ============================================

-- Step 1: Update t_audit_log table
-- The user_id column already exists and is nullable from the previous migration
-- We just need to update the foreign key constraint after migration is complete

-- Add comment to clarify the new structure
COMMENT ON COLUMN t_audit_log.user_id IS 'References auth.users.id (migrated from m_employees.id)';

-- Step 2: Update t_auth_log table
-- The user_id column already exists and is nullable from the previous migration
-- We just need to update the foreign key constraint after migration is complete

-- Add comment to clarify the new structure
COMMENT ON COLUMN t_auth_log.user_id IS 'References auth.users.id (migrated from m_employees.id)';

-- Step 3: Create helper function to log audit events with new structure
CREATE OR REPLACE FUNCTION log_audit_event(
  p_table_name TEXT,
  p_operation TEXT,
  p_record_id TEXT DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_details TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
  v_user_id UUID;
  v_user_name TEXT;
BEGIN
  -- Get current user ID from auth
  v_user_id := auth.uid();
  
  -- Get user name from metadata
  v_user_name := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email'
  );
  
  -- Insert audit log
  INSERT INTO t_audit_log (
    user_id,
    user_name,
    table_name,
    operation,
    record_id,
    old_value,
    new_value,
    details
  ) VALUES (
    v_user_id,
    v_user_name,
    p_table_name,
    p_operation,
    p_record_id,
    p_old_value,
    p_new_value,
    p_details
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create helper function to log auth events with new structure
CREATE OR REPLACE FUNCTION log_auth_event(
  p_action TEXT,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user ID from auth
  v_user_id := auth.uid();
  
  -- Insert auth log
  INSERT INTO t_auth_log (
    user_id,
    action,
    success,
    error_message,
    ip_address,
    user_agent
  ) VALUES (
    v_user_id,
    p_action,
    p_success,
    p_error_message,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create view for audit logs with user details
CREATE OR REPLACE VIEW v_audit_log_with_user AS
SELECT 
  al.*,
  COALESCE(
    (SELECT full_name FROM m_employees WHERE user_id = al.user_id),
    al.user_name
  ) as employee_name,
  (SELECT email FROM auth.users WHERE id = al.user_id) as user_email
FROM t_audit_log al;

-- Step 6: Create view for auth logs with user details
CREATE OR REPLACE VIEW v_auth_log_with_user AS
SELECT 
  al.*,
  (SELECT full_name FROM m_employees WHERE user_id = al.user_id) as employee_name,
  (SELECT email FROM auth.users WHERE id = al.user_id) as user_email
FROM t_auth_log al;

-- Step 7: Grant access to views
GRANT SELECT ON v_audit_log_with_user TO authenticated;
GRANT SELECT ON v_auth_log_with_user TO authenticated;

-- ============================================
-- NOTES FOR POST-MIGRATION CLEANUP
-- ============================================
-- 
-- After data migration is complete:
-- 1. Update foreign key constraints to reference auth.users
-- 2. Make user_id NOT NULL if required
-- 3. Update any application code to use new helper functions
-- 
-- Example cleanup SQL (run after migration):
-- ALTER TABLE t_audit_log DROP CONSTRAINT IF EXISTS t_audit_log_user_id_fkey;
-- ALTER TABLE t_audit_log ADD CONSTRAINT t_audit_log_user_id_fkey 
--   FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
-- 
-- ALTER TABLE t_auth_log DROP CONSTRAINT IF EXISTS t_auth_log_user_id_fkey;
-- ALTER TABLE t_auth_log ADD CONSTRAINT t_auth_log_user_id_fkey 
--   FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
-- ============================================
