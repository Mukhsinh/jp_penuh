-- Add KPI Sub Indicators table
-- This table stores detailed sub-indicators for each KPI indicator
-- Each indicator can have multiple sub-indicators with their own weights and scoring criteria

CREATE TABLE IF NOT EXISTS m_kpi_sub_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  indicator_id UUID NOT NULL REFERENCES m_kpi_indicators(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  target_value DECIMAL(15,2) DEFAULT 100.00,
  weight_percentage DECIMAL(5,2) NOT NULL CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
  score_1 DECIMAL(10,2) DEFAULT 20.00,
  score_2 DECIMAL(10,2) DEFAULT 40.00,
  score_3 DECIMAL(10,2) DEFAULT 60.00,
  score_4 DECIMAL(10,2) DEFAULT 80.00,
  score_5 DECIMAL(10,2) DEFAULT 100.00,
  score_1_label VARCHAR(100) DEFAULT 'Sangat Kurang',
  score_2_label VARCHAR(100) DEFAULT 'Kurang',
  score_3_label VARCHAR(100) DEFAULT 'Cukup',
  score_4_label VARCHAR(100) DEFAULT 'Baik',
  score_5_label VARCHAR(100) DEFAULT 'Sangat Baik',
  measurement_unit VARCHAR(50),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(indicator_id, code)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_kpi_sub_indicators_indicator ON m_kpi_sub_indicators(indicator_id);

-- Enable RLS
ALTER TABLE m_kpi_sub_indicators ENABLE ROW LEVEL SECURITY;

-- RLS Policies for m_kpi_sub_indicators
-- Superadmin: Full access
CREATE POLICY "Superadmin full access to sub indicators" ON m_kpi_sub_indicators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Unit Manager: Can view sub indicators for their unit only
CREATE POLICY "Unit manager view sub indicators" ON m_kpi_sub_indicators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN m_employees e ON e.email = u.email
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE u.id = auth.uid() 
      AND e.role = 'unit_manager'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );

-- Employee: Can view sub indicators for their unit only
CREATE POLICY "Employee view sub indicators" ON m_kpi_sub_indicators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN m_employees e ON e.email = u.email
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE u.id = auth.uid() 
      AND e.role = 'employee'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );

-- Update realization table to reference sub indicators instead of indicators
-- First, add the new column
ALTER TABLE t_realization ADD COLUMN IF NOT EXISTS sub_indicator_id UUID REFERENCES m_kpi_sub_indicators(id) ON DELETE CASCADE;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_realization_sub_indicator ON t_realization(sub_indicator_id);

-- Note: We keep the old indicator_id column for backward compatibility during migration
-- In production, you would migrate data and then drop the old column