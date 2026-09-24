-- Migration: Fix check constraints for m_employees
-- Run this in Supabase SQL Editor to allow new employment status values

-- 1. Drop existing constraints
ALTER TABLE m_employees DROP CONSTRAINT IF EXISTS m_employees_employment_status_check;
ALTER TABLE m_employees DROP CONSTRAINT IF EXISTS m_employees_employee_status_check;
ALTER TABLE m_employees DROP CONSTRAINT IF EXISTS m_employees_tax_type_check;

-- 2. Ensure columns have enough length (Repeat to be safe)
ALTER TABLE m_employees 
  ALTER COLUMN employment_status TYPE VARCHAR(50);

-- 3. Add updated constraints with all possible values found in data/types
ALTER TABLE m_employees 
  ADD CONSTRAINT m_employees_employment_status_check 
  CHECK (employment_status IN ('ASN', 'BLUD', 'PNS', 'PPPK', 'PPPK PARUH WAKTU', 'NON ASN', 'HONORER', 'THL', 'TENAGA KONTRAK'));

-- Also update employee_status if it's being used
ALTER TABLE m_employees 
  ADD CONSTRAINT m_employees_employee_status_check 
  CHECK (employee_status IN ('ASN', 'BLUD', 'PNS', 'PPPK', 'PPPK PARUH WAKTU', 'NON ASN', 'active', 'inactive'));

-- Tax type check
ALTER TABLE m_employees 
  ADD CONSTRAINT m_employees_tax_type_check 
  CHECK (tax_type IN ('Final', 'TER', 'Non-Taxable', 'PTKP'));
