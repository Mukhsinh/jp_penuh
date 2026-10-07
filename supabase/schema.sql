-- ============================================
-- JASPEL: Enterprise Incentive & KPI System
-- Database Schema with RLS Policies
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MASTER DATA TABLES
-- ============================================

-- Master Units (Organizational Units)
CREATE TABLE m_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  proportion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (proportion_percentage >= 0 AND proportion_percentage <= 100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Master Employees
CREATE TABLE m_employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_code VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  unit_id UUID NOT NULL REFERENCES m_units(id) ON DELETE RESTRICT,
  role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'unit_manager', 'employee')),
  email VARCHAR(255) UNIQUE NOT NULL,
  tax_status VARCHAR(10) DEFAULT 'TK/0' CHECK (tax_status IN ('TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Master KPI Categories (P1, P2, P3 per Unit)
CREATE TABLE m_kpi_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES m_units(id) ON DELETE CASCADE,
  category VARCHAR(10) NOT NULL CHECK (category IN ('P1', 'P2', 'P3')),
  category_name VARCHAR(255) NOT NULL,
  weight_percentage DECIMAL(5,2) NOT NULL CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unit_id, category)
);

-- Master KPI Indicators (Detail indicators per category)
CREATE TABLE m_kpi_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES m_kpi_categories(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  target_value DECIMAL(15,2) DEFAULT 100.00,
  weight_percentage DECIMAL(5,2) NOT NULL CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
  measurement_unit VARCHAR(50),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, code)
);

-- ============================================
-- TRANSACTION TABLES
-- ============================================

-- Pool Dana (Financial Pool per Period)
CREATE TABLE t_pool (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  revenue_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  deduction_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  net_pool DECIMAL(18,2) GENERATED ALWAYS AS (revenue_total - deduction_total) STORED,
  global_allocation_percentage DECIMAL(5,2) NOT NULL DEFAULT 100.00 CHECK (global_allocation_percentage >= 0 AND global_allocation_percentage <= 100),
  allocated_amount DECIMAL(18,2) GENERATED ALWAYS AS ((revenue_total - deduction_total) * global_allocation_percentage / 100) STORED,
  revenue_bpjs DECIMAL(18,2) DEFAULT 0.00,
  revenue_umum DECIMAL(18,2) DEFAULT 0.00,
  allocation_percentage_bpjs DECIMAL(5,2) DEFAULT 100.00,
  allocation_percentage_umum DECIMAL(5,2) DEFAULT 100.00,
  allocated_bpjs DECIMAL(18,2) DEFAULT 0.00,
  allocated_umum DECIMAL(18,2) DEFAULT 0.00,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'distributed')),
  approved_by UUID REFERENCES m_employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period)
);

-- Pool Revenue Details
CREATE TABLE t_pool_revenue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL REFERENCES t_pool(id) ON DELETE CASCADE,
  revenue_code VARCHAR(10),
  revenue_type VARCHAR(50),
  category VARCHAR(50),
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  patient_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pool Deduction Details
CREATE TABLE t_pool_deduction (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL REFERENCES t_pool(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and create policies for Pool tables
ALTER TABLE t_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_pool_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_pool_deduction ENABLE ROW LEVEL SECURITY;

GRANT ALL ON t_pool TO authenticated, anon, service_role;
GRANT ALL ON t_pool_revenue TO authenticated, anon, service_role;
GRANT ALL ON t_pool_deduction TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Allow all for authenticated on t_pool" ON t_pool;
CREATE POLICY "Allow all for authenticated on t_pool" ON t_pool FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated on t_pool_revenue" ON t_pool_revenue;
CREATE POLICY "Allow all for authenticated on t_pool_revenue" ON t_pool_revenue FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated on t_pool_deduction" ON t_pool_deduction;
CREATE POLICY "Allow all for authenticated on t_pool_deduction" ON t_pool_deduction FOR ALL TO public USING (true) WITH CHECK (true);

-- KPI Realization (Input data per employee per indicator)
CREATE TABLE t_realization (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  realization_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  achievement_percentage DECIMAL(5,2),
  score DECIMAL(10,2),
  notes TEXT,
  created_by UUID REFERENCES m_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, indicator_id, period)
);

-- Unit Score Summary (Aggregated unit performance)
CREATE TABLE t_unit_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES m_units(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  total_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  unit_weight_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  weighted_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  unit_allocated_amount DECIMAL(18,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unit_id, period)
);

-- Individual Score Summary (P1, P2, P3 breakdown)
CREATE TABLE t_individual_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  p1_score DECIMAL(10,2) DEFAULT 0.00,
  p2_score DECIMAL(10,2) DEFAULT 0.00,
  p3_score DECIMAL(10,2) DEFAULT 0.00,
  p1_weighted DECIMAL(10,2) DEFAULT 0.00,
  p2_weighted DECIMAL(10,2) DEFAULT 0.00,
  p3_weighted DECIMAL(10,2) DEFAULT 0.00,
  individual_total_score DECIMAL(10,2) DEFAULT 0.00,
  individual_weight_percentage DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  weighted_individual_score DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, period)
);

-- Final Calculation Results (Audit trail & distribution)
CREATE TABLE t_calculation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  pool_id UUID NOT NULL REFERENCES t_pool(id) ON DELETE CASCADE,
  unit_score DECIMAL(10,2) DEFAULT 0.00,
  individual_score DECIMAL(10,2) DEFAULT 0.00,
  final_score DECIMAL(10,2) DEFAULT 0.00,
  unit_allocated_amount DECIMAL(18,2) DEFAULT 0.00,
  score_proportion DECIMAL(10,6) DEFAULT 0.00,
  gross_incentive DECIMAL(18,2) DEFAULT 0.00,
  tax_amount DECIMAL(18,2) DEFAULT 0.00,
  net_incentive DECIMAL(18,2) DEFAULT 0.00,
  calculation_metadata JSONB,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, period)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_employees_unit ON m_employees(unit_id);
CREATE INDEX idx_employees_role ON m_employees(role);
CREATE INDEX idx_kpi_categories_unit ON m_kpi_categories(unit_id);
CREATE INDEX idx_kpi_indicators_category ON m_kpi_indicators(category_id);
CREATE INDEX idx_realization_employee ON t_realization(employee_id);
CREATE INDEX idx_realization_period ON t_realization(period);
CREATE INDEX idx_pool_period ON t_pool(period);
CREATE INDEX idx_calculation_period ON t_calculation_results(period);
CREATE INDEX idx_calculation_employee ON t_calculation_results(employee_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE m_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE m_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE m_kpi_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE m_kpi_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_pool_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_pool_deduction ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_realization ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_unit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_individual_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_calculation_results ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's employee record
CREATE OR REPLACE FUNCTION get_current_employee()
RETURNS UUID AS $$
  SELECT id FROM m_employees WHERE email = auth.jwt() ->> 'email' LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM m_employees 
    WHERE email = auth.jwt() ->> 'email' 
    AND role = 'superadmin'
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to get user's unit_id
CREATE OR REPLACE FUNCTION get_user_unit_id()
RETURNS UUID AS $$
  SELECT unit_id FROM m_employees WHERE email = auth.jwt() ->> 'email' LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user is unit manager
CREATE OR REPLACE FUNCTION is_unit_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM m_employees 
    WHERE email = auth.jwt() ->> 'email' 
    AND role = 'unit_manager'
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================
-- RLS POLICIES: m_units
-- ============================================

CREATE POLICY "Superadmin full access to units"
  ON m_units FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view their unit"
  ON m_units FOR SELECT
  USING (id = get_user_unit_id());

CREATE POLICY "Employees can view their unit"
  ON m_units FOR SELECT
  USING (id = get_user_unit_id());

-- ============================================
-- RLS POLICIES: m_employees
-- ============================================

CREATE POLICY "Superadmin full access to employees"
  ON m_employees FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view employees in their unit"
  ON m_employees FOR SELECT
  USING (unit_id = get_user_unit_id());

CREATE POLICY "Employees can view their own record"
  ON m_employees FOR SELECT
  USING (id = get_current_employee());

-- ============================================
-- RLS POLICIES: m_kpi_categories
-- ============================================

CREATE POLICY "Superadmin full access to kpi categories"
  ON m_kpi_categories FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view their unit's categories"
  ON m_kpi_categories FOR SELECT
  USING (unit_id = get_user_unit_id());

CREATE POLICY "Employees can view their unit's categories"
  ON m_kpi_categories FOR SELECT
  USING (unit_id = get_user_unit_id());

-- ============================================
-- RLS POLICIES: m_kpi_indicators
-- ============================================

CREATE POLICY "Superadmin full access to indicators"
  ON m_kpi_indicators FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view their unit's indicators"
  ON m_kpi_indicators FOR SELECT
  USING (
    category_id IN (
      SELECT id FROM m_kpi_categories WHERE unit_id = get_user_unit_id()
    )
  );

CREATE POLICY "Employees can view their unit's indicators"
  ON m_kpi_indicators FOR SELECT
  USING (
    category_id IN (
      SELECT id FROM m_kpi_categories WHERE unit_id = get_user_unit_id()
    )
  );

-- ============================================
-- RLS POLICIES: t_pool
-- ============================================

CREATE POLICY "Superadmin full access to pool"
  ON t_pool FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view pool"
  ON t_pool FOR SELECT
  USING (is_unit_manager());

CREATE POLICY "Employees can view approved pool"
  ON t_pool FOR SELECT
  USING (status = 'approved' OR status = 'distributed');

-- ============================================
-- RLS POLICIES: t_pool_revenue & t_pool_deduction
-- ============================================

CREATE POLICY "Superadmin full access to pool revenue"
  ON t_pool_revenue FOR ALL
  USING (is_superadmin());

CREATE POLICY "Superadmin full access to pool deduction"
  ON t_pool_deduction FOR ALL
  USING (is_superadmin());

-- ============================================
-- RLS POLICIES: t_realization
-- ============================================

CREATE POLICY "Superadmin full access to realization"
  ON t_realization FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can manage their unit's realization"
  ON t_realization FOR ALL
  USING (
    employee_id IN (
      SELECT id FROM m_employees WHERE unit_id = get_user_unit_id()
    )
  );

CREATE POLICY "Employees can view their own realization"
  ON t_realization FOR SELECT
  USING (employee_id = get_current_employee());

-- ============================================
-- RLS POLICIES: t_unit_scores
-- ============================================

CREATE POLICY "Superadmin full access to unit scores"
  ON t_unit_scores FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view their unit scores"
  ON t_unit_scores FOR SELECT
  USING (unit_id = get_user_unit_id());

CREATE POLICY "Employees can view their unit scores"
  ON t_unit_scores FOR SELECT
  USING (unit_id = get_user_unit_id());

-- ============================================
-- RLS POLICIES: t_individual_scores
-- ============================================

CREATE POLICY "Superadmin full access to individual scores"
  ON t_individual_scores FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view their unit's individual scores"
  ON t_individual_scores FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM m_employees WHERE unit_id = get_user_unit_id()
    )
  );

CREATE POLICY "Employees can view their own scores"
  ON t_individual_scores FOR SELECT
  USING (employee_id = get_current_employee());

-- ============================================
-- RLS POLICIES: t_calculation_results
-- ============================================

CREATE POLICY "Superadmin full access to calculation results"
  ON t_calculation_results FOR ALL
  USING (is_superadmin());

CREATE POLICY "Unit managers can view their unit's results"
  ON t_calculation_results FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM m_employees WHERE unit_id = get_user_unit_id()
    )
  );

CREATE POLICY "Employees can view their own results"
  ON t_calculation_results FOR SELECT
  USING (employee_id = get_current_employee());

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_m_units_updated_at BEFORE UPDATE ON m_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_m_employees_updated_at BEFORE UPDATE ON m_employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_m_kpi_categories_updated_at BEFORE UPDATE ON m_kpi_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_m_kpi_indicators_updated_at BEFORE UPDATE ON m_kpi_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_t_pool_updated_at BEFORE UPDATE ON t_pool
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_t_realization_updated_at BEFORE UPDATE ON t_realization
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_t_unit_scores_updated_at BEFORE UPDATE ON t_unit_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_t_individual_scores_updated_at BEFORE UPDATE ON t_individual_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- AUDIT AND LOGGING TABLES
-- ============================================

-- Calculation Log (Track calculation runs)
CREATE TABLE IF NOT EXISTS t_calculation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period VARCHAR(7) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error')),
  employee_count INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calculation_log_period ON t_calculation_log(period);
CREATE INDEX IF NOT EXISTS idx_calculation_log_status ON t_calculation_log(status);

-- Enable RLS on calculation log
ALTER TABLE t_calculation_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only superadmin can view calculation logs
CREATE POLICY "Superadmin full access to calculation logs"
  ON t_calculation_log FOR ALL
  TO authenticated
  USING (is_superadmin());

-- ============================================
-- AUDIT AND LOGGING TABLES
-- ============================================

-- Audit Log Table
CREATE TABLE IF NOT EXISTS t_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES m_employees(id),
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

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON t_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON t_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON t_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON t_audit_log(operation);

-- Authentication Log Table
CREATE TABLE IF NOT EXISTS t_auth_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES m_employees(id),
  action TEXT NOT NULL CHECK (action IN ('LOGIN', 'LOGOUT', 'FAILED_LOGIN')),
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_log_user_id ON t_auth_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_log_created_at ON t_auth_log(created_at DESC);

-- ============================================
-- NOTIFICATION SYSTEM
-- ============================================

-- Notifications Table
CREATE TABLE IF NOT EXISTS t_notification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES m_employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pool_approval', 'calculation_complete', 'password_reset', 'new_user', 'general')),
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_user_id ON t_notification(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_read ON t_notification(read);
CREATE INDEX IF NOT EXISTS idx_notification_created_at ON t_notification(created_at DESC);

-- ============================================
-- SETTINGS TABLE
-- ============================================

-- Settings Table
CREATE TABLE IF NOT EXISTS t_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES m_employees(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON t_settings(key);

-- Insert default settings
INSERT INTO t_settings (key, value, description) VALUES
  ('company_info', '{"name": "JASPEL Enterprise", "address": "Jakarta, Indonesia", "logo": ""}', 'Company information for reports'),
  ('tax_rates', '{"TK0": 5, "K0": 5, "K1": 15, "K2": 25, "K3": 30}', 'Tax rates by status (percentage)'),
  ('calculation_params', '{"minScore": 0, "maxScore": 100}', 'Calculation parameters'),
  ('session_timeout', '{"hours": 8}', 'Session timeout in hours'),
  ('email_templates', '{"poolApproval": "Pool for period {{period}} has been approved.", "calculationComplete": "Calculation for period {{period}} is complete.", "passwordReset": "Your password has been reset.", "newUser": "Welcome! Your temporary password is {{password}}."}', 'Email notification templates')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- KPI ASSESSMENT SYSTEM TABLES
-- ============================================

-- KPI Assessments table
CREATE TABLE IF NOT EXISTS t_kpi_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  realization_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  target_value DECIMAL(15,2) NOT NULL, -- Denormalized for calculation
  weight_percentage DECIMAL(5,2) NOT NULL, -- Denormalized for calculation
  achievement_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN target_value > 0 THEN ROUND((realization_value / target_value * 100)::numeric, 2)
      ELSE 0 
    END
  ) STORED,
  score DECIMAL(10,2) GENERATED ALWAYS AS (
    CASE 
      WHEN target_value > 0 AND (realization_value / target_value * 100) >= 100 THEN 100
      WHEN target_value > 0 THEN ROUND((realization_value / target_value * 100)::numeric, 2)
      ELSE 0 
    END
  ) STORED,
  notes TEXT,
  assessor_id UUID NOT NULL REFERENCES m_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, indicator_id, period)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessments_employee_period ON t_kpi_assessments(employee_id, period);
CREATE INDEX IF NOT EXISTS idx_assessments_period ON t_kpi_assessments(period);
CREATE INDEX IF NOT EXISTS idx_assessments_assessor ON t_kpi_assessments(assessor_id);
CREATE INDEX IF NOT EXISTS idx_assessments_indicator ON t_kpi_assessments(indicator_id);

-- Enable RLS
ALTER TABLE t_kpi_assessments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user can assess employee
CREATE OR REPLACE FUNCTION can_assess_employee(employee_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Get current user's employee record
  DECLARE
    current_user_employee m_employees%ROWTYPE;
    target_employee m_employees%ROWTYPE;
  BEGIN
    -- Get current user's employee data
    SELECT * INTO current_user_employee 
    FROM m_employees 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true;
    
    -- If no employee record found, deny access
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
    
    -- Superadmin can assess anyone
    IF current_user_employee.role = 'superadmin' THEN
      RETURN TRUE;
    END IF;
    
    -- Unit managers can only assess employees in their unit
    IF current_user_employee.role = 'unit_manager' THEN
      SELECT * INTO target_employee 
      FROM m_employees 
      WHERE id = employee_uuid;
      
      IF FOUND AND target_employee.unit_id = current_user_employee.unit_id THEN
        RETURN TRUE;
      END IF;
    END IF;
    
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for t_kpi_assessments
CREATE POLICY assessment_access_policy ON t_kpi_assessments
  FOR ALL USING (can_assess_employee(employee_id));

-- Create assessment status view
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
  SELECT DISTINCT period 
  FROM t_pool 
  WHERE status IN ('approved', 'distributed')
  ORDER BY period DESC
  LIMIT 12 -- Last 12 months
) p
LEFT JOIN m_kpi_categories c ON c.unit_id = e.unit_id AND c.is_active = true
LEFT JOIN m_kpi_indicators i ON i.category_id = c.id AND i.is_active = true
LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id 
  AND a.indicator_id = i.id 
  AND a.period = p.period
WHERE e.is_active = true
GROUP BY e.id, e.full_name, e.unit_id, u.name, p.period
ORDER BY e.full_name, p.period DESC;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON t_kpi_assessments TO authenticated;
GRANT SELECT ON v_assessment_status TO authenticated;
GRANT EXECUTE ON FUNCTION can_assess_employee(UUID) TO authenticated;

-- ============================================
-- KPI ASSESSMENT SYSTEM TABLES
-- ============================================

-- KPI Assessments table
CREATE TABLE IF NOT EXISTS t_kpi_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  realization_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  target_value DECIMAL(15,2) NOT NULL, -- Denormalized for calculation
  weight_percentage DECIMAL(5,2) NOT NULL, -- Denormalized for calculation
  achievement_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN target_value > 0 THEN ROUND((realization_value / target_value * 100)::numeric, 2)
      ELSE 0 
    END
  ) STORED,
  score DECIMAL(10,2) GENERATED ALWAYS AS (
    CASE 
      WHEN target_value > 0 AND (realization_value / target_value * 100) >= 100 THEN 100
      WHEN target_value > 0 THEN ROUND((realization_value / target_value * 100)::numeric, 2)
      ELSE 0 
    END
  ) STORED,
  notes TEXT,
  assessor_id UUID NOT NULL REFERENCES m_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, indicator_id, period)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessments_employee_period ON t_kpi_assessments(employee_id, period);
CREATE INDEX IF NOT EXISTS idx_assessments_period ON t_kpi_assessments(period);
CREATE INDEX IF NOT EXISTS idx_assessments_assessor ON t_kpi_assessments(assessor_id);
CREATE INDEX IF NOT EXISTS idx_assessments_indicator ON t_kpi_assessments(indicator_id);

-- Enable RLS
ALTER TABLE t_kpi_assessments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user can assess employee
CREATE OR REPLACE FUNCTION can_assess_employee(employee_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Get current user's employee record
  DECLARE
    current_user_employee m_employees%ROWTYPE;
    target_employee m_employees%ROWTYPE;
  BEGIN
    -- Get current user's employee data
    SELECT * INTO current_user_employee 
    FROM m_employees 
    WHERE email = auth.jwt() ->> 'email' 
    AND is_active = true;
    
    -- If no employee record found, deny access
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
    
    -- Superadmin can assess anyone
    IF current_user_employee.role = 'superadmin' THEN
      RETURN TRUE;
    END IF;
    
    -- Unit managers can only assess employees in their unit
    IF current_user_employee.role = 'unit_manager' THEN
      SELECT * INTO target_employee 
      FROM m_employees 
      WHERE id = employee_uuid;
      
      IF FOUND AND target_employee.unit_id = current_user_employee.unit_id THEN
        RETURN TRUE;
      END IF;
    END IF;
    
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for t_kpi_assessments
CREATE POLICY assessment_access_policy ON t_kpi_assessments
  FOR ALL USING (can_assess_employee(employee_id));

-- Create assessment status view
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
  SELECT DISTINCT period 
  FROM t_pool 
  WHERE status IN ('approved', 'distributed')
  ORDER BY period DESC
  LIMIT 12 -- Last 12 months
) p
LEFT JOIN m_kpi_categories c ON c.unit_id = e.unit_id AND c.is_active = true
LEFT JOIN m_kpi_indicators i ON i.category_id = c.id AND i.is_active = true
LEFT JOIN t_kpi_assessments a ON a.employee_id = e.id 
  AND a.indicator_id = i.id 
  AND a.period = p.period
WHERE e.is_active = true
GROUP BY e.id, e.full_name, e.unit_id, u.name, p.period
ORDER BY e.full_name, p.period DESC;

-- Add updated_at trigger for assessments
CREATE TRIGGER update_t_kpi_assessments_updated_at 
  BEFORE UPDATE ON t_kpi_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON t_kpi_assessments TO authenticated;
GRANT SELECT ON v_assessment_status TO authenticated;
GRANT EXECUTE ON FUNCTION can_assess_employee(UUID) TO authenticated;