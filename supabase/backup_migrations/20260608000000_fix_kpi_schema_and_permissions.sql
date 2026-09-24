-- Fix KPI Schema and permissions
-- Rename basic_index_value to base_index_value and add missing columns
-- Improve RLS permissions for unit managers to manage their unit's KPIs

-- 1. Fix m_kpi_indicators Schema
DO $$ 
BEGIN
    -- Rename if old column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='m_kpi_indicators' AND column_name='basic_index_value') THEN
        ALTER TABLE m_kpi_indicators RENAME COLUMN basic_index_value TO base_index_value;
    END IF;
END $$;

ALTER TABLE m_kpi_indicators 
ADD COLUMN IF NOT EXISTS calculation_method VARCHAR(20) DEFAULT 'indexing',
ADD COLUMN IF NOT EXISTS measurement_type VARCHAR(20) DEFAULT 'scoring',
ADD COLUMN IF NOT EXISTS unit_tariff DECIMAL(15,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS base_index_value DECIMAL(15,4) DEFAULT 0;

-- 2. Fix m_kpi_sub_indicators Schema
ALTER TABLE m_kpi_sub_indicators 
ADD COLUMN IF NOT EXISTS measurement_type VARCHAR(20) DEFAULT 'scoring',
ADD COLUMN IF NOT EXISTS unit_tariff DECIMAL(15,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_index_value DECIMAL(15,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT '{}';

-- 3. Fix RLS for m_kpi_indicators
-- We need to allow unit_manager to INSERT, UPDATE, and DELETE indicators in categories belonging to their unit
DROP POLICY IF EXISTS "Unit managers can view their unit's indicators" ON m_kpi_indicators;
DROP POLICY IF EXISTS "Unit manager manage indicators" ON m_kpi_indicators;

CREATE POLICY "Unit manager manage indicators" ON m_kpi_indicators
  FOR ALL
  TO authenticated
  USING (
    category_id IN (
      SELECT c.id FROM m_kpi_categories c
      INNER JOIN m_employees e ON c.unit_id = e.unit_id
      WHERE e.user_id = auth.uid() 
      AND e.role = 'unit_manager'
      AND e.is_active = true
    )
  )
  WITH CHECK (
    category_id IN (
      SELECT c.id FROM m_kpi_categories c
      INNER JOIN m_employees e ON c.unit_id = e.unit_id
      WHERE e.user_id = auth.uid() 
      AND e.role = 'unit_manager'
      AND e.is_active = true
    )
  );

-- 4. Fix RLS for m_kpi_sub_indicators
-- We need to allow unit_manager to INSERT, UPDATE, and DELETE sub indicators in indicators belonging to their unit
DROP POLICY IF EXISTS "Unit manager view sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Unit manager manage sub indicators" ON m_kpi_sub_indicators;

CREATE POLICY "Unit manager manage sub indicators" ON m_kpi_sub_indicators
  FOR ALL
  TO authenticated
  USING (
    indicator_id IN (
      SELECT i.id FROM m_kpi_indicators i
      JOIN m_kpi_categories c ON c.id = i.category_id
      JOIN m_employees e ON e.unit_id = c.unit_id
      WHERE e.user_id = auth.uid()
      AND e.role = 'unit_manager'
      AND e.is_active = true
    )
  )
  WITH CHECK (
    indicator_id IN (
      SELECT i.id FROM m_kpi_indicators i
      JOIN m_kpi_categories c ON c.id = i.category_id
      JOIN m_employees e ON e.unit_id = c.unit_id
      WHERE e.user_id = auth.uid()
      AND e.role = 'unit_manager'
      AND e.is_active = true
    )
  );
