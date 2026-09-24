-- Migration: Add employee status fields
-- Adds: employee_status (ASN/BLUD), tax_type (Final/TER), pns_grade (1-4)

-- Add new columns to m_employees table
ALTER TABLE m_employees 
ADD COLUMN IF NOT EXISTS employee_status VARCHAR(10) CHECK (employee_status IN ('ASN', 'BLUD')),
ADD COLUMN IF NOT EXISTS tax_type VARCHAR(10) CHECK (tax_type IN ('Final', 'TER')),
ADD COLUMN IF NOT EXISTS pns_grade INTEGER CHECK (pns_grade >= 1 AND pns_grade <= 4);

-- Set default values for existing records
UPDATE m_employees 
SET employee_status = 'ASN',
    tax_type = 'TER',
    pns_grade = 3
WHERE employee_status IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN m_employees.employee_status IS 'Status kepegawaian: ASN (Aparatur Sipil Negara) atau BLUD (Badan Layanan Umum Daerah)';
COMMENT ON COLUMN m_employees.tax_type IS 'Jenis perhitungan pajak: Final atau TER (Tarif Efektif Rata-rata)';
COMMENT ON COLUMN m_employees.pns_grade IS 'Golongan PNS: 1, 2, 3, atau 4';
