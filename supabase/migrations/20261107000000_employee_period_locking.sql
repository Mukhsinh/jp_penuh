-- Migration: Employee Period Locking and Assignment Snapshots
-- Allows locking employee unit assignments per period (e.g., Januari 2026).
-- Ensures historical KPI assessments and reports remain immutable when rotations happen in subsequent months.

CREATE TABLE IF NOT EXISTS public.t_employee_periods (
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

CREATE TABLE IF NOT EXISTS public.t_employee_period_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(7) NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.m_employees(id) ON DELETE CASCADE,
  employee_code VARCHAR(100),
  full_name VARCHAR(255) NOT NULL,
  unit_id UUID NOT NULL REFERENCES public.m_units(id) ON DELETE RESTRICT,
  position VARCHAR(255),
  role VARCHAR(50) DEFAULT 'employee',
  employee_status VARCHAR(50),
  employment_status VARCHAR(50),
  pns_grade VARCHAR(50),
  tax_status VARCHAR(50),
  tax_type VARCHAR(50),
  nik VARCHAR(100),
  bank_name VARCHAR(100),
  bank_account_number VARCHAR(100),
  bank_account_name VARCHAR(255),
  phone VARCHAR(100),
  email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_period_employee UNIQUE (period, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_snap_period ON public.t_employee_period_snapshots (period);
CREATE INDEX IF NOT EXISTS idx_emp_snap_period_unit ON public.t_employee_period_snapshots (period, unit_id);
CREATE INDEX IF NOT EXISTS idx_emp_snap_period_emp ON public.t_employee_period_snapshots (period, employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_snap_period_active ON public.t_employee_period_snapshots (period, is_active);

ALTER TABLE public.t_employee_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_employee_period_snapshots ENABLE ROW LEVEL SECURITY;

