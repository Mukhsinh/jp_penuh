-- ============================================
-- Migration: Remove address column and add TER rates
-- Date: 2026-03-10
-- ============================================

-- Remove address column from m_employees
ALTER TABLE m_employees DROP COLUMN IF EXISTS address;

-- Add TER rates to settings if not exists
INSERT INTO t_settings (key, value, description) 
VALUES (
  'ter_rates', 
  '{"categoryA": 0, "categoryB": 0, "categoryC": 0}'::jsonb,
  'Tarif Efektif Rata-rata (TER) untuk PPh 21 berdasarkan kategori penghasilan bruto'
)
ON CONFLICT (key) DO NOTHING;

-- Update description for tax_rates
UPDATE t_settings 
SET description = 'Tarif pajak PPh 21 berdasarkan status PTKP (Penghasilan Tidak Kena Pajak)'
WHERE key = 'tax_rates';
