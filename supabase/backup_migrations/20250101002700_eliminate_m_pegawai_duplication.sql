-- ============================================
-- Migration: Eliminate m_pegawai Duplication
-- Purpose: Merge m_pegawai data into m_employees and remove duplication
-- Date: 2026-03-08
-- ============================================

-- Step 1: Backup m_pegawai data (create backup table)
CREATE TABLE IF NOT EXISTS m_pegawai_backup AS 
SELECT * FROM m_pegawai;

-- Step 2: Check if m_pegawai exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'm_pegawai') THEN
    RAISE NOTICE 'm_pegawai table exists, proceeding with migration';
  ELSE
    RAISE NOTICE 'm_pegawai table does not exist, skipping migration';
    RETURN;
  END IF;
END $$;

-- Step 3: Copy unique records from m_pegawai to m_employees
-- Only copy records that don't already exist in m_employees
INSERT INTO m_employees (
  employee_code,
  full_name,
  unit_id,
  role,
  email,
  tax_status,
  is_active,
  created_at,
  updated_at
)
SELECT 
  p.employee_code,
  p.full_name,
  p.unit_id,
  COALESCE(p.role, 'employee') as role,
  COALESCE(p.email, p.employee_code || '@temp.local') as email,
  COALESCE(p.tax_status, 'TK/0') as tax_status,
  p.is_active,
  p.created_at,
  p.updated_at
FROM m_pegawai p
WHERE NOT EXISTS (
  SELECT 1 FROM m_employees e 
  WHERE e.employee_code = p.employee_code
)
ON CONFLICT (employee_code) DO NOTHING;

-- Step 4: Create mapping table for ID translation
CREATE TEMP TABLE id_mapping AS
SELECT 
  p.id as old_id,
  e.id as new_id,
  p.employee_code
FROM m_pegawai p
INNER JOIN m_employees e ON p.employee_code = e.employee_code;

-- Step 5: Update foreign key references
-- Note: This assumes foreign keys reference m_pegawai.id
-- We need to check actual foreign key constraints first

-- Check for foreign keys pointing to m_pegawai
DO $$
DECLARE
  fk_record RECORD;
BEGIN
  FOR fk_record IN 
    SELECT 
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'm_pegawai'
  LOOP
    RAISE NOTICE 'Found foreign key: %.% references m_pegawai.%',
      fk_record.table_name,
      fk_record.column_name,
      fk_record.foreign_column_name;
  END LOOP;
END $$;

-- Step 6: Update t_user table if it exists and references m_pegawai
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 't_user') THEN
    -- Drop the old foreign key constraint
    ALTER TABLE t_user DROP CONSTRAINT IF EXISTS t_user_employee_id_fkey;
    
    -- Update employee_id references using the mapping
    UPDATE t_user u
    SET employee_id = m.new_id
    FROM id_mapping m
    WHERE u.employee_id = m.old_id;
    
    -- Add new foreign key constraint to m_employees
    ALTER TABLE t_user 
    ADD CONSTRAINT t_user_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES m_employees(id) ON DELETE SET NULL;
    
    RAISE NOTICE 't_user table updated successfully';
  END IF;
END $$;

-- Step 7: Update RLS policies that reference m_pegawai
-- Drop old policies on m_pegawai
DROP POLICY IF EXISTS "Superadmin can view all pegawai" ON m_pegawai;
DROP POLICY IF EXISTS "Superadmin can insert pegawai" ON m_pegawai;
DROP POLICY IF EXISTS "Superadmin can update pegawai" ON m_pegawai;
DROP POLICY IF EXISTS "Superadmin can delete pegawai" ON m_pegawai;
DROP POLICY IF EXISTS "Unit managers can view their unit pegawai" ON m_pegawai;
DROP POLICY IF EXISTS "Unit managers can insert pegawai in their unit" ON m_pegawai;
DROP POLICY IF EXISTS "Unit managers can update their unit pegawai" ON m_pegawai;
DROP POLICY IF EXISTS "Employees can view their own pegawai record" ON m_pegawai;

-- Step 8: Drop indexes on m_pegawai
DROP INDEX IF EXISTS idx_m_pegawai_employee_code;
DROP INDEX IF EXISTS idx_m_pegawai_unit_id;
DROP INDEX IF EXISTS idx_m_pegawai_full_name;
DROP INDEX IF EXISTS idx_m_pegawai_is_active;

-- Step 9: Drop triggers on m_pegawai
DROP TRIGGER IF EXISTS update_m_pegawai_updated_at ON m_pegawai;

-- Step 10: Verification - Count records
DO $$
DECLARE
  pegawai_count INTEGER;
  employees_count INTEGER;
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO pegawai_count FROM m_pegawai;
  SELECT COUNT(*) INTO employees_count FROM m_employees;
  SELECT COUNT(*) INTO backup_count FROM m_pegawai_backup;
  
  RAISE NOTICE 'Migration verification:';
  RAISE NOTICE '  m_pegawai records: %', pegawai_count;
  RAISE NOTICE '  m_employees records: %', employees_count;
  RAISE NOTICE '  m_pegawai_backup records: %', backup_count;
  
  IF backup_count = 0 THEN
    RAISE WARNING 'Backup table is empty!';
  END IF;
END $$;

-- Step 11: Drop m_pegawai table
-- IMPORTANT: Only uncomment this after verifying the migration is successful
-- DROP TABLE IF EXISTS m_pegawai CASCADE;

-- Step 12: Create verification function
CREATE OR REPLACE FUNCTION verify_pegawai_migration()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  -- Check if m_pegawai still exists
  RETURN QUERY
  SELECT 
    'Table Existence'::TEXT,
    CASE 
      WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'm_pegawai')
      THEN 'WARNING'::TEXT
      ELSE 'OK'::TEXT
    END,
    CASE 
      WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'm_pegawai')
      THEN 'm_pegawai still exists'::TEXT
      ELSE 'm_pegawai successfully removed'::TEXT
    END;
  
  -- Check if backup exists
  RETURN QUERY
  SELECT 
    'Backup Table'::TEXT,
    CASE 
      WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'm_pegawai_backup')
      THEN 'OK'::TEXT
      ELSE 'ERROR'::TEXT
    END,
    CASE 
      WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'm_pegawai_backup')
      THEN 'Backup table exists'::TEXT
      ELSE 'Backup table missing!'::TEXT
    END;
  
  -- Check record counts
  RETURN QUERY
  SELECT 
    'Record Count'::TEXT,
    'INFO'::TEXT,
    'Total m_employees: ' || COUNT(*)::TEXT
  FROM m_employees;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Run verification
SELECT * FROM verify_pegawai_migration();

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================
-- If you need to rollback this migration:
-- 1. Restore from backup: INSERT INTO m_pegawai SELECT * FROM m_pegawai_backup;
-- 2. Recreate indexes and triggers
-- 3. Restore foreign key constraints
-- ============================================
