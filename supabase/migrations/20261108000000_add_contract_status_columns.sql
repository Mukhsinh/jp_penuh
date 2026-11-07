-- Add contract status columns for Medical (MEDIS) unit contract adjustments
ALTER TABLE t_kpi_assessments ADD COLUMN IF NOT EXISTS is_contract BOOLEAN DEFAULT false;
ALTER TABLE t_kpi_assessments ADD COLUMN IF NOT EXISTS contract_percentage NUMERIC DEFAULT 100;

ALTER TABLE m_employees ADD COLUMN IF NOT EXISTS is_contract BOOLEAN DEFAULT false;
ALTER TABLE m_employees ADD COLUMN IF NOT EXISTS contract_percentage NUMERIC DEFAULT 100;

ALTER TABLE t_employee_period_snapshots ADD COLUMN IF NOT EXISTS is_contract BOOLEAN DEFAULT false;
ALTER TABLE t_employee_period_snapshots ADD COLUMN IF NOT EXISTS contract_percentage NUMERIC DEFAULT 100;

