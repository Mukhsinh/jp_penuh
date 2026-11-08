export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      m_units: {
        Row: {
          id: string
          code: string
          name: string
          proportion_percentage: number
          remuneration_style: 'score_based' | 'activity_based_pir' | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          proportion_percentage?: number
          remuneration_style?: 'score_based' | 'activity_based_pir' | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          proportion_percentage?: number
          remuneration_style?: 'score_based' | 'activity_based_pir' | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      m_employees: {
        Row: {
          id: string
          user_id: string | null
          employee_code: string
          full_name: string
          unit_id: string
          role: string
          email: string | null
          tax_status: string | null
          employment_status: 'PNS' | 'PPPK' | 'PPPK PARUH WAKTU' | 'BLUD' | null
          employee_status: string | null
          tax_type: 'Final' | 'TER' | null
          pns_grade: string | null
          position: string | null
          phone: string | null
          nik: string | null
          bank_name: string | null
          bank_account_number: string | null
          bank_account_name: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          employee_code: string
          full_name: string
          unit_id: string
          role?: string
          email?: string
          tax_status?: string | null
          employment_status?: 'PNS' | 'PPPK' | 'PPPK PARUH WAKTU' | 'BLUD' | null
          employee_status?: string | null
          tax_type?: 'Final' | 'TER' | null
          pns_grade?: string | null
          position?: string | null
          phone?: string | null
          nik?: string | null
          bank_name?: string | null
          bank_account_number?: string | null
          bank_account_name?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          employee_code?: string
          full_name?: string
          unit_id?: string
          role?: string
          email?: string
          tax_status?: string | null
          employment_status?: 'PNS' | 'PPPK' | 'PPPK PARUH WAKTU' | 'BLUD' | null
          employee_status?: string | null
          tax_type?: 'Final' | 'TER' | null
          pns_grade?: string | null
          position?: string | null
          phone?: string | null
          nik?: string | null
          bank_name?: string | null
          bank_account_number?: string | null
          bank_account_name?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ============================================
// Application Specific Types
// ============================================

export interface Pegawai {
  id: string
  user_id: string | null
  employee_code: string
  full_name: string
  unit_id: string
  role: string
  email: string | null
  tax_status: string | null
  employment_status: 'PNS' | 'PPPK' | 'PPPK PARUH WAKTU' | 'BLUD' | null
  employee_status: string | null
  tax_type: 'Final' | 'TER' | null
  pns_grade: string | null
  position: string | null
  phone: string | null
  nik: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_account_name: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  m_units?: {
    name: string
    code: string
  }
}

export interface UserMetadata {
  role: 'superadmin' | 'unit_manager' | 'employee'
  full_name?: string
  employee_id?: string
  unit_id?: string
}

export interface UserWithEmployee {
  id: string
  email: string
  user_metadata: UserMetadata
  employee?: Pegawai | null
}

export interface CreatePegawaiData {
  employee_code: string
  full_name: string
  email?: string | null
  unit_id: string
  position?: string | null
  phone?: string | null
  nik?: string | null
  bank_name?: string | null
  bank_account_number?: string | null
  bank_account_name?: string | null
  tax_status?: string | null
  employment_status?: 'PNS' | 'PPPK' | 'PPPK PARUH WAKTU' | 'BLUD' | null
  employee_status?: string | null
  tax_type?: 'Final' | 'TER' | null
  pns_grade?: string | null
  role?: string | null
  is_active?: boolean
}

export interface EmployeePeriod {
  id: string
  period: string
  period_name: string
  is_locked: boolean
  locked_at: string | null
  locked_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface UnitPeriod {
  id: string
  period: string
  period_name: string
  is_locked: boolean
  locked_at: string | null
  locked_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface UnitPeriodSnapshot {
  id: string
  period: string
  unit_id: string
  code: string
  name: string
  proportion_percentage: number
  proportion_umum_percentage?: number | null
  use_same_proportion?: boolean
  remuneration_style?: string
  kpi_schema_mode?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type UpdatePegawaiData = Partial<CreatePegawaiData>
