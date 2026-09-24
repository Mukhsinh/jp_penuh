-- ============================================
-- JASPEL: Perfect Enterprise Incentive & KPI System
-- Comprehensive Database Schema with RLS Policies
-- Consolidated from Documentation and Application Code
-- ============================================

-- Enable UUID extension


-- ============================================
-- MASTER DATA TABLES
-- ============================================

-- Master Units (Organizational Units)
CREATE TABLE IF NOT EXISTS m_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  proportion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (proportion_percentage >= 0 AND proportion_percentage <= 100),
  remuneration_style VARCHAR(50) DEFAULT 'score_based' CHECK (remuneration_style IN ('score_based', 'activity_based_pir')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Master Employees
CREATE TABLE IF NOT EXISTS m_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE, -- Linked to auth.users.id
  employee_code VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  unit_id UUID NOT NULL REFERENCES m_units(id) ON DELETE RESTRICT,
  role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'unit_manager', 'employee')),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  nik VARCHAR(20),
  position VARCHAR(255),
  bank_name VARCHAR(100),
  bank_account_number VARCHAR(50),
  bank_account_name VARCHAR(255),
  tax_status VARCHAR(10) DEFAULT 'TK/0',
  tax_type VARCHAR(10) DEFAULT 'TER' CHECK (tax_type IN ('Final', 'TER')),
  employment_status VARCHAR(50) CHECK (employment_status IN ('PNS', 'PPPK', 'PPPK PARUH WAKTU', 'BLUD')),
  employee_status VARCHAR(50), -- e.g., 'Tetap', 'Kontrak'
  pns_grade VARCHAR(10), -- e.g., 'IV/a'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Master KPI Categories (P1, P2, P3 per Unit)
CREATE TABLE IF NOT EXISTS m_kpi_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES m_units(id) ON DELETE CASCADE,
  category VARCHAR(10) NOT NULL CHECK (category IN ('P1', 'P2', 'P3', 'P4')),
  category_name VARCHAR(255) NOT NULL,
  weight_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
  description TEXT,
  configuration_style VARCHAR(20) DEFAULT 'percentage' CHECK (configuration_style IN ('percentage', 'activity')),
  is_weighted BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unit_id, category)
);

-- Master KPI Indicators
CREATE TABLE IF NOT EXISTS m_kpi_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES m_kpi_categories(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  target_value DECIMAL(15,2) DEFAULT 100.00,
  weight_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
  measurement_unit VARCHAR(50),
  description TEXT,
  calculation_method VARCHAR(20) DEFAULT 'indexing' CHECK (calculation_method IN ('indexing', 'priority')),
  base_index_value DECIMAL(15,2) DEFAULT 1.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, code)
);

-- Master KPI Sub Indicators
CREATE TABLE IF NOT EXISTS m_kpi_sub_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  target_value DECIMAL(15,2) DEFAULT 100.00,
  weight_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
  scoring_criteria JSONB DEFAULT '[]'::jsonb,
  measurement_unit VARCHAR(50),
  measurement_type VARCHAR(20) DEFAULT 'scoring' CHECK (measurement_type IN ('scoring', 'quantitative')),
  unit_tariff DECIMAL(15,2) DEFAULT 0.00,
  base_index_value DECIMAL(15,2) DEFAULT 1.00,
  service_types TEXT[], -- Array of service codes or types
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(indicator_id, code)
);

-- ============================================
-- TRANSACTION TABLES
-- ============================================

-- Pool Dana (Financial Pool per Period)
CREATE TABLE IF NOT EXISTS t_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  revenue_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  deduction_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  net_pool DECIMAL(18,2) GENERATED ALWAYS AS (revenue_total - deduction_total) STORED,
  global_allocation_percentage DECIMAL(5,2) NOT NULL DEFAULT 100.00 CHECK (global_allocation_percentage >= 0 AND global_allocation_percentage <= 100),
  allocated_amount DECIMAL(18,2) GENERATED ALWAYS AS ((revenue_total - deduction_total) * global_allocation_percentage / 100) STORED,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'distributed')),
  approved_by UUID REFERENCES m_employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period)
);

-- KPI Realization (Input data per employee)
CREATE TABLE IF NOT EXISTS t_realization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  indicator_id UUID REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  sub_indicator_id UUID REFERENCES m_kpi_sub_indicators(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  realization_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  achievement_percentage DECIMAL(10,2),
  score DECIMAL(10,2),
  notes TEXT,
  created_by UUID REFERENCES m_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- KPI Assessments (Summary table for optimized queries)
CREATE TABLE IF NOT EXISTS t_kpi_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  realization_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  target_value DECIMAL(15,2) NOT NULL,
  weight_percentage DECIMAL(5,2) NOT NULL,
  achievement_percentage DECIMAL(10,2),
  score DECIMAL(10,2),
  sub_assessments JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  assessor_id UUID REFERENCES m_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, indicator_id, period)
);

-- Remuneration / Doctor Specific Tables
CREATE TABLE IF NOT EXISTS remunerasi_periode (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periode VARCHAR(7) NOT NULL UNIQUE,
    total_pagu DECIMAL(18, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS remunerasi_kategori (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_layanan VARCHAR(50) UNIQUE NOT NULL,
    nama_layanan VARCHAR(255) NOT NULL,
    kategori VARCHAR(100) NOT NULL,
    sub_kategori VARCHAR(100),
    nilai_indeks_dasar DECIMAL(10, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS remunerasi_transaksi_dokter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periode_id UUID NOT NULL REFERENCES remunerasi_periode(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
    kode_layanan VARCHAR(50) NOT NULL REFERENCES remunerasi_kategori(kode_layanan),
    qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS remunerasi_master_dokter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periode_id UUID NOT NULL REFERENCES remunerasi_periode(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
    pagu_guarantee_fee DECIMAL(18, 2) NOT NULL DEFAULT 0,
    persentase_pajak DECIMAL(5, 2) NOT NULL DEFAULT 0,
    no_rekening VARCHAR(50),
    bank_tujuan VARCHAR(100),
    UNIQUE(periode_id, employee_id)
);

CREATE TABLE IF NOT EXISTS remunerasi_hasil (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periode_id UUID NOT NULL REFERENCES remunerasi_periode(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
    total_langsung DECIMAL(18, 2) NOT NULL DEFAULT 0,
    total_poin_indeks DECIMAL(18, 4) NOT NULL DEFAULT 0,
    konversi_indeks_rupiah DECIMAL(18, 2) NOT NULL DEFAULT 0,
    bruto DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pajak_nominal DECIMAL(18, 2) NOT NULL DEFAULT 0,
    netto DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pir_apply DECIMAL(18, 6) NOT NULL DEFAULT 0,
    UNIQUE(periode_id, employee_id)
);

-- Pool Detail Tables
CREATE TABLE IF NOT EXISTS t_pool_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES t_pool(id) ON DELETE CASCADE,
  description VARCHAR(255),
  amount DECIMAL(18,2) NOT NULL,
  patient_count INTEGER DEFAULT 0,
  category VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_pool_deduction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES t_pool(id) ON DELETE CASCADE,
  description VARCHAR(255),
  amount DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Based PIR Tables
CREATE TABLE IF NOT EXISTS m_unit_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES m_units(id) ON DELETE CASCADE,
  category_id UUID REFERENCES m_kpi_categories(id) ON DELETE CASCADE,
  code TEXT,
  activity_name TEXT NOT NULL,
  base_index_value DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_history_pir (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(7) NOT NULL,
  unit_id UUID NOT NULL REFERENCES m_units(id) ON DELETE CASCADE,
  unit_name VARCHAR(255),
  net_pool_amount DECIMAL(18,2),
  proportion_percentage DECIMAL(5,2),
  allocated_for_unit DECIMAL(18,2),
  total_skor_kolektif DECIMAL(18,4),
  pir_value DECIMAL(18,6),
  employee_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System Tables
CREATE TABLE IF NOT EXISTS t_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID, -- References auth.users.id
  user_name TEXT,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ACCESS')),
  record_id TEXT,
  ip_address TEXT,
  old_value JSONB,
  new_value JSONB,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_auth_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- References auth.users.id
  action TEXT NOT NULL,
  ip_address TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS t_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_by UUID REFERENCES m_employees(id),
  updated_by UUID REFERENCES m_employees(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RLS Helper: Is Superadmin?
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin',
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Helper: Is Unit Manager?
CREATE OR REPLACE FUNCTION is_unit_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'unit_manager',
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Helper: Get User Unit ID
CREATE OR REPLACE FUNCTION get_user_unit_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT unit_id FROM m_employees WHERE user_id = auth.uid() LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VIEWS
-- ============================================

CREATE OR REPLACE VIEW v_assessment_status AS
SELECT 
  e.id as employee_id,
  e.full_name,
  e.unit_id,
  u.name as unit_name,
  p.period,
  COUNT(i.id) as total_indicators,
  COUNT(a.id) as assessed_indicators,
  CASE 
    WHEN COUNT(a.id) = 0 THEN 'Belum Dinilai'
    WHEN COUNT(a.id) = COUNT(i.id) THEN 'Selesai'
    ELSE 'Sebagian'
  END as status,
  ROUND((COUNT(a.id)::decimal / NULLIF(COUNT(i.id), 0) * 100), 2) as completion_percentage
FROM m_employees e
JOIN m_units u ON e.unit_id = u.id
CROSS JOIN (
  SELECT DISTINCT period FROM t_pool ORDER BY period DESC LIMIT 12
) p
LEFT JOIN m_kpi_categories c ON c.unit_id = e.unit_id AND c.is_active = true
LEFT JOIN m_kpi_indicators i ON i.category_id = c.id AND i.is_active = true
LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id 
  AND a.indicator_id = i.id 
  AND a.period = p.period
WHERE e.is_active = true
GROUP BY e.id, e.full_name, e.unit_id, u.name, p.period;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE m_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin full access on units" ON m_units FOR ALL USING (is_superadmin());
CREATE POLICY "Everyone can view active units" ON m_units FOR SELECT USING (is_active = true);

ALTER TABLE m_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin full access on employees" ON m_employees FOR ALL USING (is_superadmin());
CREATE POLICY "Managers can view same unit" ON m_employees FOR SELECT USING (is_unit_manager() AND unit_id = get_user_unit_id());
CREATE POLICY "Employees can view self" ON m_employees FOR SELECT USING (user_id = auth.uid());

ALTER TABLE m_kpi_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin full access on categories" ON m_kpi_categories FOR ALL USING (is_superadmin());
CREATE POLICY "Users can view categories" ON m_kpi_categories FOR SELECT USING (true);

ALTER TABLE m_kpi_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin full access on indicators" ON m_kpi_indicators FOR ALL USING (is_superadmin());
CREATE POLICY "Users can view indicators" ON m_kpi_indicators FOR SELECT USING (true);

ALTER TABLE m_kpi_sub_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin full access on sub indicators" ON m_kpi_sub_indicators FOR ALL USING (is_superadmin());
CREATE POLICY "Users can view sub indicators" ON m_kpi_sub_indicators FOR SELECT USING (true);

ALTER TABLE t_kpi_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin full access on assessments" ON t_kpi_assessments FOR ALL USING (is_superadmin());
CREATE POLICY "Managers can manage unit assessments" ON t_kpi_assessments FOR ALL 
  USING (is_unit_manager() AND EXISTS (SELECT 1 FROM m_employees WHERE id = t_kpi_assessments.employee_id AND unit_id = get_user_unit_id()));

ALTER TABLE t_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin only audit" ON t_audit_log FOR SELECT USING (is_superadmin());

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON m_units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON m_employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON m_kpi_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_indicators_updated_at BEFORE UPDATE ON m_kpi_indicators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_sub_indicators_updated_at BEFORE UPDATE ON m_kpi_sub_indicators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_assessments_updated_at BEFORE UPDATE ON t_kpi_assessments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON t_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
