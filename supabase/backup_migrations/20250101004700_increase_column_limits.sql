-- Migration: Increase column limits for m_employees
-- Run this in Supabase SQL Editor to allow longer values (e.g. PPPK PARUH WAKTU, long positions, etc.)

ALTER TABLE m_employees 
  ALTER COLUMN nik TYPE VARCHAR(50),
  ALTER COLUMN tax_status TYPE VARCHAR(20),
  ALTER COLUMN employee_status TYPE VARCHAR(50),
  ALTER COLUMN employment_status TYPE VARCHAR(50),
  ALTER COLUMN tax_type TYPE VARCHAR(20),
  ALTER COLUMN pns_grade TYPE VARCHAR(20);

-- Also update m_pegawai if it exists and is used
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'm_pegawai') THEN
    ALTER TABLE m_pegawai 
      ALTER COLUMN employee_code TYPE VARCHAR(100),
      ALTER COLUMN full_name TYPE VARCHAR(255),
      ALTER COLUMN tax_status TYPE VARCHAR(20);
  END IF;
END $$;
