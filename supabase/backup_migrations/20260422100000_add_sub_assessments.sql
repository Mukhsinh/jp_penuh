-- migration to add sub_assessments JSONB column to t_kpi_assessments
ALTER TABLE t_kpi_assessments
ADD COLUMN IF NOT EXISTS sub_assessments JSONB DEFAULT '[]'::jsonb;

-- Update the view or functions if necessary
