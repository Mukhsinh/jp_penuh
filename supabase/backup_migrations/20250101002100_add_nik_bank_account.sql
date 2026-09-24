-- Add NIK and bank account columns to m_employees
ALTER TABLE m_employees 
ADD COLUMN IF NOT EXISTS nik VARCHAR(16),
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS position VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS address TEXT;

-- Add unique constraint for NIK
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_nik ON m_employees(nik) WHERE nik IS NOT NULL;

-- Add comment
COMMENT ON COLUMN m_employees.nik IS 'Nomor Induk Kependudukan (16 digits)';
COMMENT ON COLUMN m_employees.bank_name IS 'Nama Bank untuk transfer insentif';
COMMENT ON COLUMN m_employees.bank_account_number IS 'Nomor Rekening Bank';
COMMENT ON COLUMN m_employees.bank_account_name IS 'Nama Pemilik Rekening';
