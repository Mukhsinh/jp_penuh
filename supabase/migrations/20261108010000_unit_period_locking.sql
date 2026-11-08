-- Migration: Unit Period Locking and Proportion Snapshots
-- Allows locking unit proportion percentages per period (e.g., Januari 2026).
-- Ensures historical calculations, reports, and assessments remain immutable when proportions change in subsequent months.

CREATE TABLE IF NOT EXISTS public.t_unit_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(7) NOT NULL UNIQUE, -- 'YYYY-MM' e.g. '2026-01'
  period_name VARCHAR(100) NOT NULL, -- e.g. 'Januari 2026'
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.t_unit_period_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(7) NOT NULL,
  unit_id UUID NOT NULL REFERENCES public.m_units(id) ON DELETE CASCADE,
  code VARCHAR(50),
  name VARCHAR(255),
  proportion_percentage NUMERIC(8,4) NOT NULL DEFAULT 0,
  proportion_umum_percentage NUMERIC(8,4) DEFAULT 0,
  use_same_proportion BOOLEAN DEFAULT TRUE,
  remuneration_style VARCHAR(50) DEFAULT 'score_based',
  kpi_schema_mode VARCHAR(50) DEFAULT 'different',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_unit_period_snapshots UNIQUE (period, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_snap_period ON public.t_unit_period_snapshots (period);
CREATE INDEX IF NOT EXISTS idx_unit_snap_period_unit ON public.t_unit_period_snapshots (period, unit_id);

ALTER TABLE public.t_unit_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_unit_period_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 't_unit_periods' AND policyname = 'Allow read t_unit_periods') THEN
    CREATE POLICY "Allow read t_unit_periods" ON public.t_unit_periods FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 't_unit_periods' AND policyname = 'Allow all t_unit_periods for authenticated') THEN
    CREATE POLICY "Allow all t_unit_periods for authenticated" ON public.t_unit_periods FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 't_unit_period_snapshots' AND policyname = 'Allow read t_unit_period_snapshots') THEN
    CREATE POLICY "Allow read t_unit_period_snapshots" ON public.t_unit_period_snapshots FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 't_unit_period_snapshots' AND policyname = 'Allow all t_unit_period_snapshots for authenticated') THEN
    CREATE POLICY "Allow all t_unit_period_snapshots for authenticated" ON public.t_unit_period_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

