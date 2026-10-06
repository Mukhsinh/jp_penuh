-- ============================================
-- Setup Superadmin User
-- ============================================
-- IMPORTANT: Jalankan script ini setelah user dibuat di Supabase Auth
-- atau gunakan script setup-auth.ts untuk membuat user secara otomatis

-- Pastikan unit IT sudah ada
INSERT INTO m_units (code, name, proportion_percentage) VALUES
('IT', 'Information Technology', 25.00)
ON CONFLICT (code) DO NOTHING;

-- Insert atau update superadmin employee
INSERT INTO m_employees (
  employee_code, 
  full_name, 
  unit_id, 
  role, 
  email, 
  tax_status,
  is_active
) VALUES (
  'SA001',
  'Admin Sungai Bahar',
  (SELECT id FROM m_units WHERE code = 'IT'),
  'superadmin',
  'admin@sungaipenuh.com',
  'TK/0',
  true
)
ON CONFLICT (email) 
DO UPDATE SET
  role = 'superadmin',
  is_active = true,
  updated_at = NOW();

-- Verifikasi
SELECT 
  employee_code,
  full_name,
  email,
  role,
  is_active
FROM m_employees 
WHERE email = 'admin@sungaipenuh.com';
