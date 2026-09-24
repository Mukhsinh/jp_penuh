-- ============================================
-- Fix RLS Functions for Auth System
-- Update RLS helper functions to use user_id instead of email
-- ============================================

-- Helper function to get current user's employee record
CREATE OR REPLACE FUNCTION get_current_employee()
RETURNS UUID AS $$
  SELECT id FROM m_employees WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin',
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to get user's unit_id
CREATE OR REPLACE FUNCTION get_user_unit_id()
RETURNS UUID AS $$
  SELECT unit_id FROM m_employees WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user is unit manager
CREATE OR REPLACE FUNCTION is_unit_manager()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'unit_manager',
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user is employee
CREATE OR REPLACE FUNCTION is_employee()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'employee',
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Add user_id column to m_employees if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'm_employees' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE m_employees ADD COLUMN user_id UUID REFERENCES auth.users(id);
    CREATE INDEX IF NOT EXISTS idx_m_employees_user_id ON m_employees(user_id);
  END IF;
END $$;