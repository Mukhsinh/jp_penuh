-- Add flexible scoring criteria support to sub indicators
-- Replace fixed score_1-5 columns with a JSON array for dynamic criteria

-- First, backup existing data in a temporary table
CREATE TEMP TABLE temp_sub_indicators_backup AS 
SELECT 
  id,
  indicator_id,
  code,
  name,
  target_value,
  weight_percentage,
  measurement_unit,
  description,
  is_active,
  created_at,
  updated_at,
  -- Convert existing scores to JSON format
  jsonb_build_array(
    jsonb_build_object('score', score_1, 'label', score_1_label),
    jsonb_build_object('score', score_2, 'label', score_2_label),
    jsonb_build_object('score', score_3, 'label', score_3_label),
    jsonb_build_object('score', score_4, 'label', score_4_label),
    jsonb_build_object('score', score_5, 'label', score_5_label)
  ) as scoring_criteria
FROM m_kpi_sub_indicators;

-- Drop the old columns
ALTER TABLE m_kpi_sub_indicators 
DROP COLUMN IF EXISTS score_1,
DROP COLUMN IF EXISTS score_2,
DROP COLUMN IF EXISTS score_3,
DROP COLUMN IF EXISTS score_4,
DROP COLUMN IF EXISTS score_5,
DROP COLUMN IF EXISTS score_1_label,
DROP COLUMN IF EXISTS score_2_label,
DROP COLUMN IF EXISTS score_3_label,
DROP COLUMN IF EXISTS score_4_label,
DROP COLUMN IF EXISTS score_5_label;

-- Add new flexible scoring criteria column
ALTER TABLE m_kpi_sub_indicators 
ADD COLUMN scoring_criteria JSONB DEFAULT '[]'::jsonb;

-- Add constraint to ensure scoring_criteria is an array
ALTER TABLE m_kpi_sub_indicators 
ADD CONSTRAINT check_scoring_criteria_is_array 
CHECK (jsonb_typeof(scoring_criteria) = 'array');

-- Restore data with new structure
INSERT INTO m_kpi_sub_indicators (
  id, indicator_id, code, name, target_value, weight_percentage,
  measurement_unit, description, is_active, created_at, updated_at, scoring_criteria
)
SELECT 
  id, indicator_id, code, name, target_value, weight_percentage,
  measurement_unit, description, is_active, created_at, updated_at, scoring_criteria
FROM temp_sub_indicators_backup
ON CONFLICT (id) DO UPDATE SET
  scoring_criteria = EXCLUDED.scoring_criteria;

-- Create index for scoring criteria queries
CREATE INDEX IF NOT EXISTS idx_kpi_sub_indicators_scoring ON m_kpi_sub_indicators USING GIN (scoring_criteria);

-- Add helper function to validate scoring criteria structure
CREATE OR REPLACE FUNCTION validate_scoring_criteria(criteria JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if it's an array
  IF jsonb_typeof(criteria) != 'array' THEN
    RETURN FALSE;
  END IF;
  
  -- Check if array is not empty
  IF jsonb_array_length(criteria) = 0 THEN
    RETURN FALSE;
  END IF;
  
  -- Check each criterion has required fields
  FOR i IN 0..jsonb_array_length(criteria)-1 LOOP
    IF NOT (
      criteria->i ? 'score' AND 
      criteria->i ? 'label' AND
      jsonb_typeof(criteria->i->'score') = 'number' AND
      jsonb_typeof(criteria->i->'label') = 'string'
    ) THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add constraint to validate scoring criteria structure
ALTER TABLE m_kpi_sub_indicators 
ADD CONSTRAINT check_scoring_criteria_valid 
CHECK (validate_scoring_criteria(scoring_criteria));

-- Update the updated_at trigger if it exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists for updated_at
DROP TRIGGER IF EXISTS update_kpi_sub_indicators_updated_at ON m_kpi_sub_indicators;
CREATE TRIGGER update_kpi_sub_indicators_updated_at
    BEFORE UPDATE ON m_kpi_sub_indicators
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();