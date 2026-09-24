-- Fix RLS policies for t_settings table
-- The old migration used wrong table name 't_employee' (should be 'm_employees')
-- and was missing INSERT policy needed for upsert operations

-- Drop broken old policies if they exist
DROP POLICY IF EXISTS "Superadmin can view all settings" ON t_settings;
DROP POLICY IF EXISTS "Superadmin can update settings" ON t_settings;
DROP POLICY IF EXISTS "Anyone can view settings" ON t_settings;
DROP POLICY IF EXISTS "Superadmin can insert settings" ON t_settings;

-- Ensure RLS is enabled
ALTER TABLE t_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read settings (needed for sidebar, footer, exports)
CREATE POLICY "Authenticated users can view settings"
  ON t_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only superadmin can insert/update/delete settings
CREATE POLICY "Superadmin can insert settings"
  ON t_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_superadmin());

CREATE POLICY "Superadmin can update settings"
  ON t_settings FOR UPDATE
  TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Superadmin can delete settings"
  ON t_settings FOR DELETE
  TO authenticated
  USING (is_superadmin());
