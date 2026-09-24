-- Fix unique constraint on m_kpi_categories to support different revenue types
-- The current constraint (unit_id, category) blocks having both BPJS and UMUM versions
-- of the same category (P1, P2, P3) for one unit. Adding revenue_type to the constraint fixes this.

-- Step 1: Drop the existing unique constraint
ALTER TABLE m_kpi_categories DROP CONSTRAINT IF EXISTS m_kpi_categories_unit_id_category_key;

-- Step 2: Add revenue_type column if not exists (in case it was added informally)
ALTER TABLE m_kpi_categories ADD COLUMN IF NOT EXISTS revenue_type VARCHAR(10) DEFAULT 'bpjs';

-- Step 3: Create new unique constraint including revenue_type
ALTER TABLE m_kpi_categories ADD CONSTRAINT m_kpi_categories_unit_id_category_revenue_type_key 
  UNIQUE (unit_id, category, revenue_type);

-- Step 4: Create index for faster queries by revenue_type
CREATE INDEX IF NOT EXISTS idx_kpi_categories_revenue_type ON m_kpi_categories(revenue_type);
