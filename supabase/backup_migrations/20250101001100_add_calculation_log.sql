-- Migration: Add calculation log table and update unit scores
-- Date: 2026-03-06

-- Add unit_allocated_amount column to t_unit_scores if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 't_unit_scores' 
    AND column_name = 'unit_allocated_amount'
  ) THEN
    ALTER TABLE t_unit_scores 
    ADD COLUMN unit_allocated_amount DECIMAL(18,2) DEFAULT 0.00;
  END IF;
END $$;

-- Create calculation log table if not exists
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

-- Create indexes if not exists
CREATE INDEX IF NOT EXISTS idx_calculation_log_period ON t_calculation_log(period);
CREATE INDEX IF NOT EXISTS idx_calculation_log_status ON t_calculation_log(status);

-- Enable RLS on calculation log
ALTER TABLE t_calculation_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Superadmin full access to calculation logs" ON t_calculation_log;

-- RLS Policy: Only superadmin can view calculation logs
CREATE POLICY "Superadmin full access to calculation logs"
  ON t_calculation_log FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM m_employees
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND is_active = true
    )
  );
