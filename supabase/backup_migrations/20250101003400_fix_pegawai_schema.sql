-- Fix m_employees table to include missing columns for pegawai functionality
-- This migration adds the missing columns that the pegawai components expect

-- Add missing columns to m_employees table
ALTER TABLE m_employees 
ADD COLUMN IF NOT EXISTS position VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS nik VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS employee_status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'gross',
ADD COLUMN IF NOT EXISTS pns_grade VARCHAR(10);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_m_employees_employee_code ON m_employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_m_employees_unit_id ON m_employees(unit_id);
CREATE INDEX IF NOT EXISTS idx_m_employees_email ON m_employees(email);
CREATE INDEX IF NOT EXISTS idx_m_employees_is_active ON m_employees(is_active);

-- Update RLS policies for m_employees to work with auth system
DROP POLICY IF EXISTS "Superadmin full access to employees" ON m_employees;
DROP POLICY IF EXISTS "Unit managers can view employees in their unit" ON m_employees;
DROP POLICY IF EXISTS "Employees can view employees in their unit" ON m_employees;

-- Create new RLS policies that work with auth.users metadata
CREATE POLICY "Superadmin full access to employees"
  ON m_employees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.user_metadata->>'role' = 'superadmin'
    )
  );

CREATE POLICY "Unit managers can view employees in their unit"
  ON m_employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.user_metadata->>'role' = 'unit_manager'
      AND auth.users.user_metadata->>'unit_id' = unit_id::text
    )
  );

CREATE POLICY "Employees can view employees in their unit"
  ON m_employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.user_metadata->>'unit_id' = unit_id::text
    )
  );

-- Ensure RLS is enabled
ALTER TABLE m_employees ENABLE ROW LEVEL SECURITY;