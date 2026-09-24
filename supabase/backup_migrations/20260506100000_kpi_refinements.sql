-- Migration: Add activity-based columns to KPI tables
-- Date: 2026-05-06

-- 1. Add configuration_style to m_kpi_categories
ALTER TABLE m_kpi_categories 
ADD COLUMN IF NOT EXISTS configuration_style VARCHAR(50) DEFAULT 'percentage' CHECK (configuration_style IN ('percentage', 'activity'));

-- 2. Add basic_index_value to m_kpi_indicators
ALTER TABLE m_kpi_indicators 
ADD COLUMN IF NOT EXISTS basic_index_value DECIMAL(15, 4) DEFAULT 0.0000;

-- 3. Update existing P1 categories for MEDIS unit to be 'activity' based if needed
-- Assuming 'MEDIS' unit exists and uses activity-based logic for P1
UPDATE m_kpi_categories 
SET configuration_style = 'activity'
WHERE category = 'P1' 
AND unit_id IN (SELECT id FROM m_units WHERE name = 'MEDIS' OR name = 'Medis');

-- 4. Re-create or update views if they depend on these tables (optional, check dependencies)
-- Standard views like v_assessment_status should still work as they don't explicitly select * and exclude new columns
