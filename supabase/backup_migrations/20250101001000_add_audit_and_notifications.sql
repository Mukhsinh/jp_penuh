-- Audit Log Table
CREATE TABLE IF NOT EXISTS t_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES t_employee(id),
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

CREATE INDEX idx_audit_log_timestamp ON t_audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_user_id ON t_audit_log(user_id);
CREATE INDEX idx_audit_log_table_name ON t_audit_log(table_name);
CREATE INDEX idx_audit_log_operation ON t_audit_log(operation);

-- Authentication Log Table
CREATE TABLE IF NOT EXISTS t_auth_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES t_employee(id),
  action TEXT NOT NULL CHECK (action IN ('LOGIN', 'LOGOUT', 'FAILED_LOGIN')),
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_log_user_id ON t_auth_log(user_id);
CREATE INDEX idx_auth_log_created_at ON t_auth_log(created_at DESC);

-- Notifications Table
CREATE TABLE IF NOT EXISTS t_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES t_employee(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pool_approval', 'calculation_complete', 'password_reset', 'new_user', 'general')),
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_notification_user_id ON t_notification(user_id);
CREATE INDEX idx_notification_read ON t_notification(read);
CREATE INDEX idx_notification_created_at ON t_notification(created_at DESC);

-- Settings Table
CREATE TABLE IF NOT EXISTS t_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES t_employee(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settings_key ON t_settings(key);

-- Insert default settings
INSERT INTO t_settings (key, value, description) VALUES
  ('company_info', '{"name": "JASPEL Enterprise", "address": "Jakarta, Indonesia", "logo": ""}', 'Company information for reports'),
  ('tax_rates', '{"TK0": 5, "K0": 5, "K1": 15, "K2": 25, "K3": 30}', 'Tax rates by status (percentage)'),
  ('calculation_params', '{"minScore": 0, "maxScore": 100}', 'Calculation parameters'),
  ('session_timeout', '{"hours": 8}', 'Session timeout in hours'),
  ('email_templates', '{"poolApproval": "Pool for period {{period}} has been approved.", "calculationComplete": "Calculation for period {{period}} is complete.", "passwordReset": "Your password has been reset.", "newUser": "Welcome! Your temporary password is {{password}}."}', 'Email notification templates')
ON CONFLICT (key) DO NOTHING;

-- Function to log audit trail
CREATE OR REPLACE FUNCTION log_audit_trail()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO t_audit_log (table_name, operation, record_id, old_value, details)
    VALUES (TG_TABLE_NAME, TG_OP, OLD.id::TEXT, row_to_json(OLD), 'Record deleted');
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO t_audit_log (table_name, operation, record_id, old_value, new_value, details)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id::TEXT, row_to_json(OLD), row_to_json(NEW), 'Record updated');
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO t_audit_log (table_name, operation, record_id, new_value, details)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id::TEXT, row_to_json(NEW), 'Record created');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for audit logging on key tables
CREATE TRIGGER audit_employee AFTER INSERT OR UPDATE OR DELETE ON t_employee
  FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER audit_unit AFTER INSERT OR UPDATE OR DELETE ON t_unit
  FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER audit_pool AFTER INSERT OR UPDATE OR DELETE ON t_pool
  FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER audit_kpi_category AFTER INSERT OR UPDATE OR DELETE ON t_kpi_category
  FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER audit_kpi_indicator AFTER INSERT OR UPDATE OR DELETE ON t_kpi_indicator
  FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER audit_settings AFTER INSERT OR UPDATE OR DELETE ON t_settings
  FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

-- RLS Policies for audit log (Superadmin only)
ALTER TABLE t_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin can view all audit logs"
  ON t_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_employee
      WHERE t_employee.id = auth.uid()
      AND t_employee.role = 'superadmin'
    )
  );

-- RLS Policies for notifications
ALTER TABLE t_notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON t_notification FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON t_notification FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for settings (Superadmin only)
ALTER TABLE t_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin can view all settings"
  ON t_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_employee
      WHERE t_employee.id = auth.uid()
      AND t_employee.role = 'superadmin'
    )
  );

CREATE POLICY "Superadmin can update settings"
  ON t_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM t_employee
      WHERE t_employee.id = auth.uid()
      AND t_employee.role = 'superadmin'
    )
  );
