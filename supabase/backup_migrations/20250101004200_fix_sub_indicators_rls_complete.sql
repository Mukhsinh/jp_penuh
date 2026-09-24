-- Fix RLS policies untuk m_kpi_sub_indicators agar konsisten dengan schema utama
-- Masalah: tabel m_kpi_sub_indicators tidak memiliki RLS policies yang tepat

-- Drop existing policies jika ada
DROP POLICY IF EXISTS "Superadmin full access to sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Unit manager view sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Unit manager access sub indicators" ON m_kpi_sub_indicators;
DROP POLICY IF EXISTS "Employee view sub indicators" ON m_kpi_sub_indicators;

-- Pastikan RLS enabled
ALTER TABLE m_kpi_sub_indicators ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: m_kpi_sub_indicators
-- ============================================

-- Superadmin: Full access (menggunakan fungsi is_superadmin yang sudah ada)
CREATE POLICY "Superadmin full access to sub indicators"
  ON m_kpi_sub_indicators FOR ALL
  USING (is_superadmin());

-- Unit managers: Can view and manage sub indicators for their unit only
CREATE POLICY "Unit managers can manage their unit's sub indicators"
  ON m_kpi_sub_indicators FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM m_employees e
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE e.email = auth.jwt() ->> 'email'
      AND e.role = 'unit_manager'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );

-- Employees: Can view sub indicators for their unit only
CREATE POLICY "Employees can view their unit's sub indicators"
  ON m_kpi_sub_indicators FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM m_employees e
      JOIN m_kpi_indicators i ON i.id = m_kpi_sub_indicators.indicator_id
      JOIN m_kpi_categories c ON c.id = i.category_id
      WHERE e.email = auth.jwt() ->> 'email'
      AND e.unit_id = c.unit_id
      AND e.is_active = true
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON m_kpi_sub_indicators TO authenticated;