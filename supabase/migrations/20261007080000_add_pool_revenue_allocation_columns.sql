-- Add BPJS & UMUM revenue and allocation columns to t_pool
ALTER TABLE t_pool 
ADD COLUMN IF NOT EXISTS allocation_percentage_bpjs NUMERIC(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS allocation_percentage_umum NUMERIC(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS revenue_bpjs NUMERIC(18,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS revenue_umum NUMERIC(18,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS allocated_bpjs NUMERIC(18,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS allocated_umum NUMERIC(18,2) DEFAULT 0.00;

-- Add revenue_code & revenue_type to t_pool_revenue
ALTER TABLE t_pool_revenue
ADD COLUMN IF NOT EXISTS revenue_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS revenue_type VARCHAR(50);

-- Enable RLS and add permissions & policies for pool tables
ALTER TABLE t_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_pool_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_pool_deduction ENABLE ROW LEVEL SECURITY;

GRANT ALL ON t_pool TO authenticated, anon, service_role;
GRANT ALL ON t_pool_revenue TO authenticated, anon, service_role;
GRANT ALL ON t_pool_deduction TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Allow all for authenticated on t_pool" ON t_pool;
CREATE POLICY "Allow all for authenticated on t_pool" ON t_pool FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated on t_pool_revenue" ON t_pool_revenue;
CREATE POLICY "Allow all for authenticated on t_pool_revenue" ON t_pool_revenue FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated on t_pool_deduction" ON t_pool_deduction;
CREATE POLICY "Allow all for authenticated on t_pool_deduction" ON t_pool_deduction FOR ALL TO public USING (true) WITH CHECK (true);
