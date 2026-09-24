-- Migration: Fix employment_status constraint to be more permissive
-- This ensures all normalized employment status values are allowed

-- 1. Drop existing constraints (safe - uses IF EXISTS)
ALTER TABLE m_employees DROP CONSTRAINT IF EXISTS m_employees_employment_status_check;
ALTER TABLE m_employees DROP CONSTRAINT IF EXISTS m_employees_employee_status_check;
ALTER TABLE m_employees DROP CONSTRAINT IF EXISTS m_employees_tax_type_check;

-- 2. Ensure column type is wide enough
ALTER TABLE m_employees 
  ALTER COLUMN employment_status TYPE VARCHAR(50);

-- 3. Add updated constraint with all possible values
ALTER TABLE m_employees 
  ADD CONSTRAINT m_employees_employment_status_check 
  CHECK (employment_status IS NULL OR employment_status IN (
    'ASN', 'BLUD', 'PNS', 'PPPK', 'PPPK PARUH WAKTU', 
    'NON ASN', 'HONORER', 'THL', 'TENAGA KONTRAK'
  ));

-- 4. Fix tax_type constraint to be permissive
ALTER TABLE m_employees 
  ADD CONSTRAINT m_employees_tax_type_check 
  CHECK (tax_type IS NULL OR tax_type IN ('Final', 'TER', 'Non-Taxable', 'PTKP', 'gross'));

-- 5. Normalize any existing invalid employment_status values to 'BLUD'
UPDATE m_employees 
SET employment_status = 'BLUD' 
WHERE employment_status IS NOT NULL 
  AND employment_status NOT IN (
    'ASN', 'BLUD', 'PNS', 'PPPK', 'PPPK PARUH WAKTU', 
    'NON ASN', 'HONORER', 'THL', 'TENAGA KONTRAK'
  );
