export interface Assessment {
  id?: string
  employee_id: string
  indicator_id: string
  sub_indicator_id?: string | null
  period: string
  realization_value: number
  target_value: number
  weight_percentage: number
  achievement_percentage?: number
  score?: number
  notes?: string
  assessor_id: string
  revenue_type?: string | null
  created_at?: string
  updated_at?: string
}

export interface AssessmentStatus {
  employee_id: string
  full_name: string
  unit_id: string
  unit_name: string
  period: string
  total_indicators: number
  assessed_indicators: number
  status: string
  completion_percentage: number
}

export interface AssessmentIndicator {
  id: string
  name: string
  target_value: number
  weight_percentage: number
  category_id: string
  category_name: string
  category_type: 'P1' | 'P2' | 'P3'
  current_assessment?: Assessment
}