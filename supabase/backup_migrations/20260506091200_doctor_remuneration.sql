-- ============================================
-- Doctor Remuneration Module Migration
-- ============================================

-- 1. Update m_units to support different remuneration styles
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'remuneration_style') THEN
        CREATE TYPE remuneration_style AS ENUM ('score_based', 'activity_based_pir');
    END IF;
END $$;

ALTER TABLE m_units ADD COLUMN IF NOT EXISTS remuneration_style remuneration_style DEFAULT 'score_based';

-- Set MEDIS unit to activity_based_pir if it exists
UPDATE m_units SET remuneration_style = 'activity_based_pir' WHERE name ILIKE '%MEDIS%';

-- 2. Master Periode Remunerasi
CREATE TABLE IF NOT EXISTS remunerasi_periode (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    periode VARCHAR(7) NOT NULL UNIQUE, -- Format: YYYY-MM
    total_pagu DECIMAL(18, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft', -- draft, calculated, finalized
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Master Nilai Indeks per Layanan
CREATE TABLE IF NOT EXISTS remunerasi_kategori (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode_layanan VARCHAR(50) UNIQUE NOT NULL,
    nama_layanan VARCHAR(255) NOT NULL,
    kategori VARCHAR(100) NOT NULL, -- e.g., A. RAWAT JALAN
    sub_kategori VARCHAR(100),
    nilai_indeks_dasar DECIMAL(10, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Data Transaksi Pelayanan (Template 1 Import)
CREATE TABLE IF NOT EXISTS remunerasi_transaksi_dokter (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    periode_id UUID NOT NULL REFERENCES remunerasi_periode(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
    kode_layanan VARCHAR(50) NOT NULL REFERENCES remunerasi_kategori(kode_layanan),
    qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Data Master Remunerasi & Potongan (Template 2 Import)
CREATE TABLE IF NOT EXISTS remunerasi_master_dokter (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    periode_id UUID NOT NULL REFERENCES remunerasi_periode(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
    pagu_guarantee_fee DECIMAL(18, 2) NOT NULL DEFAULT 0,
    persentase_pajak DECIMAL(5, 2) NOT NULL DEFAULT 0,
    no_rekening VARCHAR(50),
    bank_tujuan VARCHAR(100),
    UNIQUE(periode_id, employee_id)
);

-- 6. Hasil Akhir Kalkulasi
CREATE TABLE IF NOT EXISTS remunerasi_hasil (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    periode_id UUID NOT NULL REFERENCES remunerasi_periode(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES m_employees(id) ON DELETE CASCADE,
    total_langsung DECIMAL(18, 2) NOT NULL DEFAULT 0,
    total_poin_indeks DECIMAL(18, 4) NOT NULL DEFAULT 0,
    konversi_indeks_rupiah DECIMAL(18, 2) NOT NULL DEFAULT 0,
    bruto DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pajak_nominal DECIMAL(18, 2) NOT NULL DEFAULT 0,
    netto DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pir_apply DECIMAL(18, 6) NOT NULL DEFAULT 0,
    UNIQUE(periode_id, employee_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_rem_trans_periode ON remunerasi_transaksi_dokter(periode_id);
CREATE INDEX IF NOT EXISTS idx_rem_trans_employee ON remunerasi_transaksi_dokter(employee_id);
CREATE INDEX IF NOT EXISTS idx_rem_hasil_periode ON remunerasi_hasil(periode_id);

-- Enable RLS
ALTER TABLE remunerasi_periode ENABLE ROW LEVEL SECURITY;
ALTER TABLE remunerasi_kategori ENABLE ROW LEVEL SECURITY;
ALTER TABLE remunerasi_transaksi_dokter ENABLE ROW LEVEL SECURITY;
ALTER TABLE remunerasi_master_dokter ENABLE ROW LEVEL SECURITY;
ALTER TABLE remunerasi_hasil ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies for Authenticated Users (Admins can do all)
CREATE POLICY "Superadmin full access on rem_periode" ON remunerasi_periode FOR ALL TO authenticated USING (true);
CREATE POLICY "Superadmin full access on rem_kategori" ON remunerasi_kategori FOR ALL TO authenticated USING (true);
CREATE POLICY "Superadmin full access on rem_trans" ON remunerasi_transaksi_dokter FOR ALL TO authenticated USING (true);
CREATE POLICY "Superadmin full access on rem_master" ON remunerasi_master_dokter FOR ALL TO authenticated USING (true);
CREATE POLICY "Superadmin full access on rem_hasil" ON remunerasi_hasil FOR ALL TO authenticated USING (true);
