-- Performance optimization indexes
-- Menambahkan index untuk query yang sering digunakan

-- Index untuk middleware dan auth queries
CREATE INDEX IF NOT EXISTS idx_m_employees_user_id ON m_employees(user_id);
CREATE INDEX IF NOT EXISTS idx_m_employees_unit_id ON m_employees(unit_id);
CREATE INDEX IF NOT EXISTS idx_m_employees_role ON m_employees(role);
CREATE INDEX IF NOT EXISTS idx_m_employees_is_active ON m_employees(is_active);

-- Index untuk dashboard queries
CREATE INDEX IF NOT EXISTS idx_t_kpi_assessments_employee_id ON t_kpi_assessments(employee_id);
CREATE INDEX IF NOT EXISTS idx_t_kpi_assessments_created_at ON t_kpi_assessments(created_at);
CREATE INDEX IF NOT EXISTS idx_t_kpi_assessments_period ON t_kpi_assessments(period);
CREATE INDEX IF NOT EXISTS idx_t_kpi_assessments_score ON t_kpi_assessments(score);

-- Composite indexes untuk complex queries
CREATE INDEX IF NOT EXISTS idx_t_kpi_assessments_employee_period ON t_kpi_assessments(employee_id, period);
CREATE INDEX IF NOT EXISTS idx_t_kpi_assessments_unit_period ON t_kpi_assessments(unit_id, period);

-- Index untuk realization queries
CREATE INDEX IF NOT EXISTS idx_t_realization_employee_id ON t_realization(employee_id);
CREATE INDEX IF NOT EXISTS idx_t_realization_period ON t_realization(period);
CREATE INDEX IF NOT EXISTS idx_t_realization_year_month ON t_realization(year, month);

-- Index untuk pool queries
CREATE INDEX IF NOT EXISTS idx_t_pools_period ON t_pools(period);
CREATE INDEX IF NOT EXISTS idx_t_pools_is_active ON t_pools(is_active);

-- Index untuk notifications
CREATE INDEX IF NOT EXISTS idx_t_notifications_user_id ON t_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_t_notifications_is_read ON t_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_t_notifications_created_at ON t_notifications(created_at);

-- Index untuk settings
CREATE INDEX IF NOT EXISTS idx_t_settings_key ON t_settings(key);

-- Analyze tables untuk update statistics
ANALYZE m_employees;
ANALYZE t_kpi_assessments;
ANALYZE t_realization;
ANALYZE t_pools;
ANALYZE t_notifications;
ANALYZE t_settings;