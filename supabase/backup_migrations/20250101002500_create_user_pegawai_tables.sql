-- ============================================
-- Migration: Create t_user and m_pegawai tables
-- Purpose: Separate user authentication from employee master data
-- ============================================

-- Create m_pegawai table (Master Pegawai/Employee)
CREATE TABLE IF NOT EXISTS m_pegawai (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_code VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  unit_id UUID NOT NULL REFERENCES m_units(id) ON DELETE RESTRICT,
  position VARCHAR(255),
  tax_status VARCHAR(10) DEFAULT 'TK/0' CHECK (tax_status IN ('TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3')),
  phone VARCHAR(20),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create t_user table (User Authentication)
CREATE TABLE IF NOT EXISTS t_user (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'unit_manager', 'employee')),
  employee_id UUID REFERENCES m_pegawai(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_m_pegawai_employee_code ON m_pegawai(employee_code);
CREATE INDEX IF NOT EXISTS idx_m_pegawai_unit_id ON m_pegawai(unit_id);
CREATE INDEX IF NOT EXISTS idx_m_pegawai_full_name ON m_pegawai(full_name);
CREATE INDEX IF NOT EXISTS idx_m_pegawai_is_active ON m_pegawai(is_active);

CREATE INDEX IF NOT EXISTS idx_t_user_email ON t_user(email);
CREATE INDEX IF NOT EXISTS idx_t_user_employee_id ON t_user(employee_id);
CREATE INDEX IF NOT EXISTS idx_t_user_role ON t_user(role);
CREATE INDEX IF NOT EXISTS idx_t_user_is_active ON t_user(is_active);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_m_pegawai_updated_at
  BEFORE UPDATE ON m_pegawai
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_t_user_updated_at
  BEFORE UPDATE ON t_user
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS Policies for m_pegawai
-- ============================================

-- Enable RLS
ALTER TABLE m_pegawai ENABLE ROW LEVEL SECURITY;

-- Superadmin: Full access
CREATE POLICY "Superadmin can view all pegawai"
  ON m_pegawai FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user
      WHERE t_user.id = auth.uid()
      AND t_user.role = 'superadmin'
      AND t_user.is_active = true
    )
  );

CREATE POLICY "Superadmin can insert pegawai"
  ON m_pegawai FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM t_user
      WHERE t_user.id = auth.uid()
      AND t_user.role = 'superadmin'
      AND t_user.is_active = true
    )
  );

CREATE POLICY "Superadmin can update pegawai"
  ON m_pegawai FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user
      WHERE t_user.id = auth.uid()
      AND t_user.role = 'superadmin'
      AND t_user.is_active = true
    )
  );

CREATE POLICY "Superadmin can delete pegawai"
  ON m_pegawai FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user
      WHERE t_user.id = auth.uid()
      AND t_user.role = 'superadmin'
      AND t_user.is_active = true
    )
  );

-- Unit Manager: Can view pegawai in their unit
CREATE POLICY "Unit manager can view pegawai in their unit"
  ON m_pegawai FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user
      WHERE t_user.id = auth.uid()
      AND t_user.role = 'unit_manager'
      AND t_user.is_active = true
      AND t_user.employee_id IN (
        SELECT id FROM m_pegawai WHERE unit_id = m_pegawai.unit_id
      )
    )
  );

-- Employee: Can view their own data
CREATE POLICY "Employee can view their own data"
  ON m_pegawai FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user
      WHERE t_user.id = auth.uid()
      AND t_user.employee_id = m_pegawai.id
      AND t_user.is_active = true
    )
  );

-- ============================================
-- RLS Policies for t_user
-- ============================================

-- Enable RLS
ALTER TABLE t_user ENABLE ROW LEVEL SECURITY;

-- Superadmin: Full access
CREATE POLICY "Superadmin can view all users"
  ON t_user FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user AS tu
      WHERE tu.id = auth.uid()
      AND tu.role = 'superadmin'
      AND tu.is_active = true
    )
  );

CREATE POLICY "Superadmin can insert users"
  ON t_user FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM t_user AS tu
      WHERE tu.id = auth.uid()
      AND tu.role = 'superadmin'
      AND tu.is_active = true
    )
  );

CREATE POLICY "Superadmin can update users"
  ON t_user FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user AS tu
      WHERE tu.id = auth.uid()
      AND tu.role = 'superadmin'
      AND tu.is_active = true
    )
  );

CREATE POLICY "Superadmin can delete users"
  ON t_user FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_user AS tu
      WHERE tu.id = auth.uid()
      AND tu.role = 'superadmin'
      AND tu.is_active = true
    )
  );

-- Users can view their own data
CREATE POLICY "Users can view their own data"
  ON t_user FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ============================================
-- Data Migration Function
-- ============================================

CREATE OR REPLACE FUNCTION migrate_employees_to_new_structure()
RETURNS void AS $$
DECLARE
  emp_record RECORD;
  new_pegawai_id UUID;
BEGIN
  -- Loop through all employees in m_employees
  FOR emp_record IN 
    SELECT * FROM m_employees WHERE is_active = true
  LOOP
    -- Check if pegawai already exists
    SELECT id INTO new_pegawai_id
    FROM m_pegawai
    WHERE employee_code = emp_record.employee_code;
    
    -- If not exists, create pegawai record
    IF new_pegawai_id IS NULL THEN
      INSERT INTO m_pegawai (
        employee_code,
        full_name,
        unit_id,
        tax_status,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        emp_record.employee_code,
        emp_record.full_name,
        emp_record.unit_id,
        emp_record.tax_status,
        emp_record.is_active,
        emp_record.created_at,
        emp_record.updated_at
      )
      RETURNING id INTO new_pegawai_id;
    END IF;
    
    -- If employee has user_id (linked to auth.users), create t_user record
    IF emp_record.user_id IS NOT NULL THEN
      -- Check if user already exists
      IF NOT EXISTS (SELECT 1 FROM t_user WHERE id = emp_record.user_id) THEN
        -- Get email from auth.users metadata or use employee email
        INSERT INTO t_user (
          id,
          email,
          role,
          employee_id,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          emp_record.user_id,
          COALESCE(emp_record.email, emp_record.employee_code || '@temp.local'),
          COALESCE(emp_record.role, 'employee'),
          new_pegawai_id,
          emp_record.is_active,
          emp_record.created_at,
          emp_record.updated_at
        );
      END IF;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migration completed successfully';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE m_pegawai IS 'Master data pegawai organisasi - independen dari user login';
COMMENT ON TABLE t_user IS 'Data user dengan akses login - relasi ke m_pegawai';
COMMENT ON COLUMN t_user.employee_id IS 'Relasi ke m_pegawai (nullable - tidak semua user harus pegawai)';
COMMENT ON COLUMN m_pegawai.employee_code IS 'Kode pegawai unik';
