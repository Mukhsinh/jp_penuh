-- Add NIK and bank account fields to m_employees table
ALTER TABLE m_employees
ADD COLUMN IF NOT EXISTS nik VARCHAR(16),
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(255),
ADD COLUMN IF NOT EXISTS position VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS address TEXT;

-- Add index for NIK for faster lookups
CREATE INDEX IF NOT EXISTS idx_m_employees_nik ON m_employees(nik);

-- Add comment
COMMENT ON COLUMN m_employees.nik IS 'Nomor Induk Kependudukan (NIK)';
COMMENT ON COLUMN m_employees.bank_name IS 'Nama Bank';
COMMENT ON COLUMN m_employees.bank_account_number IS 'Nomor Rekening Bank';
COMMENT ON COLUMN m_employees.bank_account_holder IS 'Nama Pemegang Rekening';
