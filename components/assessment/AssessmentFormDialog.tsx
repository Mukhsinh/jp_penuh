'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, AlertCircle, Target, TrendingUp, Copy, LayoutDashboard, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import type { AssessmentStatus } from '@/lib/types/assessment.types'
import type { ScoringCriterion } from '@/lib/types/kpi.types'
import { formatDecimal } from '@/lib/utils/format'
import { isMedicalUnit as checkMedicalUnit } from '@/lib/utils/medical-unit'

interface KPISubIndicator {
  id: string
  indicator_id: string
  code: string
  name: string
  target_value: number
  weight_percentage: number
  scoring_criteria: ScoringCriterion[]
  measurement_unit?: string
  description?: string
  measurement_type?: 'scoring' | 'quantitative'
  unit_tariff?: number
  base_index_value?: number
  service_types?: string[]
  tariffs?: Array<{
    id: string
    service_type: string
    name: string
    tariff: number
  }>
}

interface KPIIndicator {
  id: string
  code: string
  name: string
  target_value: number
  weight_percentage: number
  calculation_method: 'indexing' | 'priority'
  base_index_value: number
  measurement_unit?: string
  description?: string
  sub_indicators: KPISubIndicator[]
}

interface KPICategory {
  category: string
  category_name: string
  weight_percentage: number
  configuration_style?: 'index' | 'activity'
  is_weighted?: boolean
  indicators: KPIIndicator[]
}

interface SubAssessmentData {
  id?: string
  sub_indicator_id: string
  realization_value: number
  score: number
}

interface AssessmentData {
  id?: string
  indicator_id: string
  realization_value: number
  achievement_percentage: number
  score: number
  notes: string
  sub_assessments: SubAssessmentData[]
}

interface AssessmentFormDialogProps {
  open: boolean
  onClose: () => void
  employee: AssessmentStatus
  period: string
  revenueType?: 'bpjs' | 'umum'
  isApproved?: boolean
  onSaved: () => void
}

export default function AssessmentFormDialog({
  open,
  onClose,
  employee,
  period,
  revenueType = 'bpjs',
  isApproved = false,
  onSaved
}: AssessmentFormDialogProps) {
  const [categories, setCategories] = useState<KPICategory[]>([])
  const [assessments, setAssessments] = useState<Record<string, AssessmentData>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copyingPrevious, setCopyingPrevious] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMedicalUnit = checkMedicalUnit(employee?.unit_id, employee?.unit_name)

  const [activeRevenueType, setActiveRevenueType] = useState<'bpjs' | 'umum'>(revenueType)
  const [kpiSchemaMode, setKpiSchemaMode] = useState<'same' | 'different'>('same')
  const [applyToUmum, setApplyToUmum] = useState<boolean>(true)

  // Sync active revenue type when prop changes or dialog opens
  useEffect(() => {
    if (revenueType) {
      setActiveRevenueType(revenueType)
    }
  }, [revenueType, open])

  // Fetch unit's KPI schema mode on mount/open
  useEffect(() => {
    async function fetchUnitSchemaMode() {
      if (open && employee?.unit_id) {
        try {
          const res = await fetch(`/api/units/${employee.unit_id}`)
          if (res.ok) {
            const uData = await res.json()
            if (uData.unit?.kpi_schema_mode) {
              setKpiSchemaMode(uData.unit.kpi_schema_mode)
            }
          }
        } catch (e) {
          console.error('Failed to fetch unit schema mode:', e)
        }
      }
    }
    fetchUnitSchemaMode()
  }, [open, employee?.unit_id])

  // Load KPI indicators and existing assessments in coordinated sequence to avoid race conditions
  useEffect(() => {
    if (open && employee) {
      loadAssessmentData(activeRevenueType)
    }
  }, [open, employee, activeRevenueType])

  const getIndicatorTarget = (indicator: KPIIndicator) => {
    if (indicator.sub_indicators && indicator.sub_indicators.length > 0) {
      const subTargetSum = indicator.sub_indicators.reduce((sum, sub) => {
        const weight = isMedicalUnit ? 1 : (sub.weight_percentage / 100)
        return sum + ((sub.target_value || 0) * weight)
      }, 0)
      if (subTargetSum > 0) return subTargetSum
    }
    return indicator.target_value || 0
  }

  const loadAssessmentData = async (revenueType: 'bpjs' | 'umum' = activeRevenueType) => {
    setLoading(true)
    setError(null)
    try {
      const [indicatorsResponse, assessmentsResponse] = await Promise.all([
        fetch(`/api/assessment/indicators?employee_id=${employee.employee_id}&period=${period}&revenue_type=${revenueType}`, {
          cache: 'no-store'
        }),
        fetch(`/api/assessment?employee_id=${employee.employee_id}&period=${period}&revenue_type=${revenueType}`, {
          cache: 'no-store'
        })
      ])

      let loadedCategories: KPICategory[] = []
      if (indicatorsResponse.ok) {
        const indData = await indicatorsResponse.json()
        loadedCategories = indData.indicators || []
        setCategories(loadedCategories)
      } else {
        setError('Gagal memuat indikator KPI')
      }

      if (assessmentsResponse.ok) {
        const data = await assessmentsResponse.json()
        const assessmentMap: Record<string, AssessmentData> = {}

        data.assessments?.forEach((item: any) => {
          const indicatorId = item.indicator_id

          if (!assessmentMap[indicatorId]) {
            assessmentMap[indicatorId] = {
              indicator_id: indicatorId,
              realization_value: 0,
              achievement_percentage: 0,
              score: 0,
              notes: '',
              sub_assessments: []
            }
          }

          if (item.sub_indicator_id) {
            // Sub-assessment row
            const existingSubIndex = assessmentMap[indicatorId].sub_assessments.findIndex(
              s => s.sub_indicator_id === item.sub_indicator_id
            )
            const subRealiz = Number(item.realization_value) || 0
            const subSc = Number(item.score) || subRealiz
            if (existingSubIndex >= 0) {
              assessmentMap[indicatorId].sub_assessments[existingSubIndex] = {
                id: item.id,
                sub_indicator_id: item.sub_indicator_id,
                realization_value: subRealiz,
                score: subSc
              }
            } else {
              assessmentMap[indicatorId].sub_assessments.push({
                id: item.id,
                sub_indicator_id: item.sub_indicator_id,
                realization_value: subRealiz,
                score: subSc
              })
            }
          } else {
            // Main indicator row
            assessmentMap[indicatorId].id = item.id
            assessmentMap[indicatorId].realization_value = Number(item.realization_value) || 0
            assessmentMap[indicatorId].achievement_percentage = Number(item.achievement_percentage) || 0
            assessmentMap[indicatorId].score = Number(item.score) || 0
            assessmentMap[indicatorId].notes = item.notes || ''
          }
        })

        // Reconcile with loadedCategories: guarantees sub_assessments entries exist
        // for all configured sub-indicators and populates orphan main rows
        const allIndicators = loadedCategories.flatMap(c => c.indicators)
        for (const indicator of allIndicators) {
          if (indicator.sub_indicators && indicator.sub_indicators.length > 0) {
            const assessment = assessmentMap[indicator.id]
            if (assessment) {
              // Populate sub_assessments from main row realization_value if sub_assessments is empty
              if (assessment.sub_assessments.length === 0 && assessment.realization_value !== 0) {
                if (indicator.sub_indicators.length === 1) {
                  const sub = indicator.sub_indicators[0]
                  assessment.sub_assessments.push({
                    sub_indicator_id: sub.id,
                    realization_value: assessment.realization_value,
                    score: assessment.score || assessment.realization_value
                  })
                }
              }

              // Also ensure sub_assessments exist for every sub_indicator
              for (const sub of indicator.sub_indicators) {
                const subEntry = assessment.sub_assessments.find(s => s.sub_indicator_id === sub.id)
                if (!subEntry && indicator.sub_indicators.length === 1 && assessment.realization_value) {
                  assessment.sub_assessments.push({
                    sub_indicator_id: sub.id,
                    realization_value: assessment.realization_value,
                    score: assessment.score || assessment.realization_value
                  })
                }
              }
            }
          }
        }

        setAssessments(assessmentMap)
      }
    } catch (error) {
      console.error('Error loading assessment data:', error)
      setError('Terjadi kesalahan saat memuat data penilaian')
    } finally {
      setLoading(false)
    }
  }

  const calculateAchievement = (realizationValue: number, targetValue: number): number => {
    if (targetValue <= 0) return 0
    return Math.round((realizationValue / targetValue) * 100 * 100) / 100
  }

  const calculateScore = (achievementPercentage: number): number => {
    return achievementPercentage >= 100 ? 100 : achievementPercentage
  }

  const handleRealizationChange = (indicatorId: string, value: string, targetValue: number) => {
    const indicator = categories.flatMap(c => c.indicators).find(i => i.id === indicatorId)
    const category = categories.find(c => c.indicators.some(i => i.id === indicatorId))
    const isActivity = category?.configuration_style === 'activity'

    // For qualitative/regular, realizationValue is the input.
    // For activity Medis without sub_indicators, realizationValue is the VOLUME input.
    const inputRealization = parseFloat(value) || 0

    let achievementPercentage = 0
    let score = 0
    let derivedRealizationValue = inputRealization

    if (indicator) {
      const isPriority = indicator.calculation_method === 'priority' || category?.configuration_style === 'activity'
      const isUnweightedCat = category?.is_weighted === false

      if (isPriority) {
        const tariff = parseFloat(indicator.base_index_value?.toString() || '0')
        score = inputRealization * tariff
        derivedRealizationValue = inputRealization
        achievementPercentage = 100
      } else {
        achievementPercentage = calculateAchievement(inputRealization, targetValue)
        // Score logic: if unweighted category, score is achievement, else it's weighted if needed?
        // Wait, 'score' in t_kpi_assessments for indexing indicators is usually achievement 
        // because the PIR calculation handles the weighting at the unit level.
        // Actually, existing code says: score = calculateScore(achievementPercentage)
        score = calculateScore(achievementPercentage)
      }
    }

    setAssessments(prev => ({
      ...prev,
      [indicatorId]: {
        indicator_id: indicatorId,
        realization_value: derivedRealizationValue,
        achievement_percentage: achievementPercentage,
        score: score,
        notes: prev[indicatorId]?.notes || '',
        sub_assessments: prev[indicatorId]?.sub_assessments || []
      }
    }))
  }

  const handleSubAssessmentChange = (indicatorId: string, subIndicatorId: string, realizationValue: number, score: number) => {
    setAssessments(prev => {
      const current = prev[indicatorId] || {
        indicator_id: indicatorId,
        realization_value: 0,
        achievement_percentage: 0,
        score: 0,
        notes: '',
        sub_assessments: []
      }

      const subAssessments = [...(current.sub_assessments || [])]
      const index = subAssessments.findIndex(s => s.sub_indicator_id === subIndicatorId)

      if (index >= 0) {
        subAssessments[index] = { id: subAssessments[index].id, sub_indicator_id: subIndicatorId, realization_value: realizationValue, score }
      } else {
        subAssessments.push({ sub_indicator_id: subIndicatorId, realization_value: realizationValue, score })
      }

      // Find the indicator to get sub-indicator weights and target
      const indicator = categories.flatMap(c => c.indicators).find(i => i.id === indicatorId)
      let totalAchievement = 0
      let isQuantitativeIndicator = false
      let sumVolumes = 0
      let sumScores = 0

      if (indicator && indicator.sub_indicators.length > 0) {
        // Bottom-up logic: Sum (Skor * Bobot)
        subAssessments.forEach(sub => {
          const subConfig = indicator.sub_indicators.find(s => s.id === sub.sub_indicator_id)
          if (subConfig?.measurement_type === 'quantitative') isQuantitativeIndicator = true

          // For quantitative/activity, weight acts as 1 (so volume*tariff adds up directly)
          const weight = (isMedicalUnit || isQuantitativeIndicator) ? 1 : (subConfig ? (subConfig.weight_percentage / 100) : 0)
          sumScores += (sub.score || 0) * weight
          sumVolumes += (sub.realization_value || 0)
        })

        const maxTarget = getIndicatorTarget(indicator)

        if (isQuantitativeIndicator || isMedicalUnit) {
          totalAchievement = 100 // Placeholder visual
        } else {
          totalAchievement = maxTarget > 0 ? (sumScores / maxTarget) * 100 : sumScores
        }
      } else {
        totalAchievement = current.achievement_percentage
        sumVolumes = current.realization_value
        sumScores = current.score
      }
      const category = categories.find(c => c.indicators.some(i => i.id === indicatorId))
      const isPriority = indicator && (indicator.calculation_method === 'priority' || category?.configuration_style === 'activity')

      // If qualitative sub-indicators without target, use sum of scores without cap.
      const maxTarget = indicator ? getIndicatorTarget(indicator) : 0
      const finalScore = isPriority ? Number(sumScores.toFixed(4)) : (indicator && indicator.sub_indicators.length > 0 && maxTarget === 0 ? sumScores : calculateScore(totalAchievement))

      return {
        ...prev,
        [indicatorId]: {
          ...current,
          realization_value: Number(sumVolumes.toFixed(4)),
          sub_assessments: subAssessments,
          achievement_percentage: Number(totalAchievement.toFixed(2)),
          score: finalScore
        }
      }
    })
  }

  const handleNotesChange = (indicatorId: string, notes: string) => {
    setAssessments(prev => ({
      ...prev,
      [indicatorId]: {
        ...prev[indicatorId],
        indicator_id: indicatorId,
        notes
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      // Prepare batch data for all indicators
      const batchData = categories.flatMap(category =>
        category.indicators.map((indicator) => {
          const assessment = assessments[indicator.id] || {
            indicator_id: indicator.id,
            realization_value: 0,
            achievement_percentage: 0,
            score: 0,
            notes: '',
            sub_assessments: []
          }

          // Ensure ALL configured sub-indicators are included, not just ones in state.
          // This guarantees the backend creates/updates rows for every sub-indicator.
          const fullSubAssessments = (indicator.sub_indicators || []).map(subConfig => {
            const existing = assessment.sub_assessments.find(s => s.sub_indicator_id === subConfig.id)
            const fallbackVal = (!existing && indicator.sub_indicators.length === 1 && assessment.realization_value !== undefined) ? assessment.realization_value : 0
            const fallbackScore = (!existing && indicator.sub_indicators.length === 1 && (assessment.score || assessment.realization_value)) ? (assessment.score || assessment.realization_value) : 0
            return {
              id: existing?.id,
              sub_indicator_id: subConfig.id,
              code: subConfig.code,
              name: subConfig.name,
              realization_value: existing?.realization_value ?? fallbackVal,
              score: existing?.score ?? fallbackScore
            }
          })

          return {
            id: assessment.id,
            employee_id: employee.employee_id,
            indicator_id: indicator.id,
            period: period,
            realization_value: assessment.realization_value,
            target_value: getIndicatorTarget(indicator),
            weight_percentage: indicator.weight_percentage,
            notes: assessment.notes,
            score: assessment.score,
            revenue_type: activeRevenueType,
            sub_assessments: fullSubAssessments
          }
        })
      )

      const response = await fetch('/api/assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assessments: batchData,
          apply_to_umum: activeRevenueType === 'bpjs' ? applyToUmum : false
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Gagal menyimpan penilaian')
      }

      // 2. Trigger parent refresh/success handler
      // This will call handleAssessmentSaved in AssessmentTable,
      // which shows the toast success and closes the dialog.
      onSaved()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Gagal menyimpan penilaian')
      console.error('Error saving assessments:', error)
      toast.error('Gagal menyimpan penilaian: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleCopyPrevious = async () => {
    setCopyingPrevious(true)
    setError(null)
    try {
      const response = await fetch(`/api/assessment/previous?employee_id=${employee.employee_id}&current_period=${period}&revenue_type=${activeRevenueType}`)
      if (response.ok) {
        const data = await response.json()
        if (data.assessments && data.assessments.length > 0) {
          const assessmentMap: Record<string, AssessmentData> = {}

          data.assessments.forEach((item: any) => {
            const indicatorId = item.indicator_id

            if (!assessmentMap[indicatorId]) {
              assessmentMap[indicatorId] = {
                indicator_id: indicatorId,
                realization_value: 0,
                achievement_percentage: 0,
                score: 0,
                notes: '',
                sub_assessments: []
              }
            }

            if (item.sub_indicator_id) {
              assessmentMap[indicatorId].sub_assessments.push({
                sub_indicator_id: item.sub_indicator_id,
                realization_value: item.realization_value,
                score: item.score || 0
              })
            } else {
              assessmentMap[indicatorId].realization_value = item.realization_value
              assessmentMap[indicatorId].achievement_percentage = item.achievement_percentage || 0
              assessmentMap[indicatorId].score = item.score || 0
              assessmentMap[indicatorId].notes = item.notes || ''
            }
          })

          // Ensure single sub-indicator rows get reconciled if only main row existed
          const allIndicators = categories.flatMap(c => c.indicators)
          for (const indicator of allIndicators) {
            if (indicator.sub_indicators && indicator.sub_indicators.length > 0) {
              const assessment = assessmentMap[indicator.id]
              if (assessment) {
                if (assessment.sub_assessments.length === 0 && assessment.realization_value !== undefined) {
                  if (indicator.sub_indicators.length === 1) {
                    const sub = indicator.sub_indicators[0]
                    assessment.sub_assessments.push({
                      sub_indicator_id: sub.id,
                      realization_value: assessment.realization_value,
                      score: assessment.score || assessment.realization_value
                    })
                  }
                }
              }
            }
          }

          // Update current state with copied values
          setAssessments((prev) => ({ ...prev, ...assessmentMap }))

          // Show intermediate success toast
          toast.info('Data berhasil disalin, sedang memproses penyimpanan otomatis...')

          // Critical: We need to perform the save using the newly grouped map 
          // because setAssessments state update won't be available immediately for handleSave
          setSaving(true)

          // Refactored save logic for direct batch data
          const batchData = categories.flatMap(category =>
            category.indicators.map((indicator) => {
              const assessment = assessmentMap[indicator.id] || {
                indicator_id: indicator.id,
                realization_value: 0,
                achievement_percentage: 0,
                score: 0,
                notes: '',
                sub_assessments: []
              }

              // Ensure ALL configured sub-indicators are included
              const fullSubAssessments = (indicator.sub_indicators || []).map(subConfig => {
                const existing = assessment.sub_assessments.find(s => s.sub_indicator_id === subConfig.id)
                const fallbackVal = (!existing && indicator.sub_indicators.length === 1 && assessment.realization_value !== undefined) ? assessment.realization_value : 0
                const fallbackScore = (!existing && indicator.sub_indicators.length === 1 && (assessment.score || assessment.realization_value)) ? (assessment.score || assessment.realization_value) : 0
                return {
                  sub_indicator_id: subConfig.id,
                  code: subConfig.code,
                  name: subConfig.name,
                  realization_value: existing?.realization_value ?? fallbackVal,
                  score: existing?.score ?? fallbackScore
                }
              })

              return {
                employee_id: employee.employee_id,
                indicator_id: indicator.id,
                period: period,
                realization_value: assessment.realization_value,
                target_value: getIndicatorTarget(indicator),
                weight_percentage: indicator.weight_percentage,
                notes: assessment.notes,
                score: assessment.score,
                sub_assessments: fullSubAssessments,
                revenue_type: activeRevenueType,
                assessor_id: '' // API will handle this from session
              }
            })
          )

          const saveResponse = await fetch('/api/assessment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assessments: batchData,
              apply_to_umum: activeRevenueType === 'bpjs' ? applyToUmum : false
            })
          })

          if (!saveResponse.ok) {
            const errorData = await saveResponse.json()
            throw new Error(errorData.error || 'Gagal menyimpan data yang disalin')
          }

          toast.success('Penilaian berhasil disalin dan disimpan!')
          onSaved()
          onClose()
        } else {
          setError('Tidak ada data penilaian sebelumnya untuk disalin.')
        }
      } else {
        setError('Gagal menyalin penilaian sebelumnya.')
      }
    } catch (error) {
      console.error('Error copying previous assessments:', error)
      setError(error instanceof Error ? error.message : 'Terjadi kesalahan saat menyalin data.')
    } finally {
      setCopyingPrevious(false)
      setSaving(false)
    }
  }

  const getAchievementColor = (percentage: number) => {
    if (percentage >= 100) return 'text-green-600'
    if (percentage >= 80) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getAchievementBadge = (percentage: number) => {
    if (percentage >= 100) return 'bg-green-100 text-green-800'
    if (percentage >= 80) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Target className="h-5 w-5 text-blue-600" />
                Penilaian KPI - {employee.full_name}
              </DialogTitle>
              <DialogDescription>
                Periode: {period} • Unit: {employee.unit_name}
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-semibold shadow-sm"
              onClick={handleCopyPrevious}
              disabled={saving || copyingPrevious || loading || isApproved}
            >
              {copyingPrevious ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {copyingPrevious ? 'Menyalin & Menyimpan...' : 'Salin Penilaian Sebelumnya'}
            </Button>
          </div>

          {kpiSchemaMode === 'different' && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <span className="text-xs font-semibold text-slate-500 mr-1">Skema Pendapatan:</span>
              <button
                type="button"
                onClick={() => setActiveRevenueType('bpjs')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${activeRevenueType === 'bpjs'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeRevenueType === 'bpjs' ? 'bg-white' : 'bg-blue-600'}`} />
                KPI BPJS Kesehatan
              </button>
              <button
                type="button"
                onClick={() => setActiveRevenueType('umum')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${activeRevenueType === 'umum'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeRevenueType === 'umum' ? 'bg-white' : 'bg-amber-600'}`} />
                KPI Pendapatan UMUM
              </button>
            </div>
          )}
        </DialogHeader>

        {isApproved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3 text-xs text-emerald-800 font-semibold shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div>
              <span>Periode <strong>{period}</strong> telah disetujui oleh Superadmin dan berstatus terkunci. Penilaian hanya dapat dilihat (Read-Only).</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Real-time Recapitulation & Progress */}
        {!loading && categories.length > 0 && (() => {
          const totalInd = categories.flatMap(c => c.indicators).length
          const filledInd = Object.keys(assessments).length
          const pct = totalInd > 0 ? (filledInd / totalInd) * 100 : 0

          let totalSkorIndeks = 0;
          let totalSkorPrioritas = 0;

          categories.forEach(category => {
            category.indicators.forEach(indicator => {
              const assessment = assessments[indicator.id]
              const isPriority = indicator.calculation_method === 'priority' || category.configuration_style === 'activity'
              if (isPriority) {
                if (indicator.sub_indicators && indicator.sub_indicators.length > 0) {
                  let subPrioSum = 0
                  let hasSubData = false
                  ;(assessment?.sub_assessments || []).forEach(sub => {
                    const subConf = indicator.sub_indicators.find(s => s.id === sub.sub_indicator_id)
                    if (subConf) {
                      hasSubData = true
                      const subVal = (sub.score !== undefined && sub.score !== null && sub.score !== 0)
                        ? sub.score
                        : (Number(sub.realization_value) || 0)
                      subPrioSum += subVal
                    }
                  })
                  totalSkorPrioritas += hasSubData ? subPrioSum : (assessment?.score || assessment?.realization_value || 0)
                } else {
                  totalSkorPrioritas += assessment ? (assessment.score || assessment.realization_value || 0) : 0
                }
              }
            })
          })

          const pCards = ['P1', 'P2', 'P3'].map((catCode) => {
            const category = categories.find(c => c.category === catCode)
            if (!category) return null

            let totalRealisasiKategori = 0
            let totalTargetKategori = 0

            category.indicators.forEach(indicator => {
              const assessment = assessments[indicator.id]
              const indWeight = parseFloat(indicator.weight_percentage.toString()) || 0
              const indTarget = getIndicatorTarget(indicator)
              let indRealisasi = assessment ? assessment.realization_value : 0
              const isPriority = indicator.calculation_method === 'priority'

              // For indicators with sub-indicators (e.g. BOR with 80% and 20% weights),
              // use the weighted score calculated from sub-indicators to match report formula exactly.
              if (indicator.sub_indicators && indicator.sub_indicators.length > 0) {
                let calcSum = 0
                let hasSubData = false
                ;(assessment?.sub_assessments || []).forEach(sub => {
                  const subConf = indicator.sub_indicators.find(s => s.id === sub.sub_indicator_id)
                  if (subConf) {
                    hasSubData = true
                    const w = isMedicalUnit ? 1 : (subConf.weight_percentage / 100)
                    const subScore = (sub.score !== undefined && sub.score !== null && sub.score !== 0)
                      ? sub.score
                      : (Number(sub.realization_value) || 0)
                    calcSum += subScore * w
                  }
                })
                if (hasSubData) {
                  indRealisasi = calcSum
                } else if (assessment?.score !== undefined && assessment?.score !== null && assessment?.score !== 0) {
                  indRealisasi = assessment.score
                }
              }

              if (!isPriority) {
                if (category.is_weighted !== false) {
                  totalRealisasiKategori += (indRealisasi * (indWeight / 100))
                  totalTargetKategori += (indTarget * (indWeight / 100))
                } else {
                  // Unweighted category: sum indicators as raw achievement vs 100
                  const ach = indTarget > 0 ? (indRealisasi / indTarget) * 100 : 0
                  totalRealisasiKategori += ach
                  totalTargetKategori += 100
                }
              }
            })

            const porsiKategori = category.weight_percentage
            let kontribusiAkhir = 0
            if (totalTargetKategori > 0) {
              if (category.is_weighted !== false) {
                kontribusiAkhir = (totalRealisasiKategori / totalTargetKategori) * porsiKategori
              } else {
                // For unweighted, the "contribution" is just the average achievement percentage
                kontribusiAkhir = (totalRealisasiKategori / totalTargetKategori) * 100
              }
            } else {
              if (category.is_weighted !== false) {
                kontribusiAkhir = totalRealisasiKategori * (porsiKategori / 100)
              } else {
                kontribusiAkhir = totalRealisasiKategori
              }
            }

            const poinAkhir = isMedicalUnit ? totalRealisasiKategori : kontribusiAkhir;
            totalSkorIndeks += poinAkhir;

            return (
              <Card key={catCode} className="border-gray-200">
                <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Total {catCode} ({porsiKategori}%)
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0 border-blue-200 bg-blue-50 text-blue-700">
                    {poinAkhir.toFixed(2)}
                  </Badge>
                </CardHeader>
                <CardContent className="py-0 px-3 pb-2">
                  <div className="text-base font-bold text-gray-900">
                    {poinAkhir.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {totalRealisasiKategori.toFixed(2)} / {totalTargetKategori.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            )
          })

          return (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
              <Card className="bg-blue-50/50 border-blue-100">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 px-3 pb-2">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span>{filledInd} / {totalInd}</span>
                      <span>{Math.round(pct)}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>

              {pCards}

              <Card className="bg-emerald-50 border-emerald-200">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Total Skor (Indeks)
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 px-3 pb-2">
                  <div className="text-lg font-bold text-emerald-700">
                    {totalSkorIndeks.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-purple-50 border-purple-200">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Priority (Kuant.)
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 px-3 pb-2">
                  <div className="text-lg font-bold text-purple-700">
                    {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(totalSkorPrioritas)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })()}

        <div className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[...Array(2)].map((_, j) => (
                        <Skeleton key={j} className="h-20 w-full" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Tidak ada indikator KPI yang dikonfigurasi untuk unit ini.</p>
            </div>
          ) : (
            categories.map((category) => (
              <Card key={category.category}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{category.category} - {category.category_name}</span>
                    <div className="flex gap-2">
                      {category.is_weighted === false && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          Tanpa Bobot
                        </Badge>
                      )}
                      {!isMedicalUnit && category.is_weighted !== false && (
                        <Badge variant="outline">
                          Bobot: {category.weight_percentage}%
                        </Badge>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription>
                    {category.indicators.length} indikator dalam kategori ini
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {category.indicators.map((indicator) => {
                      const assessment = assessments[indicator.id]
                      let realizationValue = assessment?.realization_value || 0
                      let achievementPct = assessment?.achievement_percentage || 0
                      let score = assessment?.score || 0
                      const hasSubIndicators = indicator.sub_indicators && indicator.sub_indicators.length > 0

                      // Workaround: Re-hydrate zeroed generated columns from DB using the preserved realization_values
                      if (hasSubIndicators && getIndicatorTarget(indicator) === 0) {
                        let calcSum = 0;
                        let isQuant = false;
                        (assessment?.sub_assessments || []).forEach(sub => {
                          const subConf = indicator.sub_indicators.find(s => s.id === sub.sub_indicator_id)
                          if (subConf?.measurement_type === 'quantitative') {
                            isQuant = true;
                            calcSum += sub.score || ((sub.realization_value || 0) * (subConf?.base_index_value || 1))
                          } else {
                            const w = (isMedicalUnit || isQuant) ? 1 : (subConf ? (subConf.weight_percentage / 100) : 0)
                            calcSum += (sub.realization_value || 0) * w
                          }
                        })
                        achievementPct = calcSum;
                        score = calcSum;
                      }

                      let displayedScore = score
                      if (!isMedicalUnit && category.is_weighted !== false && indicator.calculation_method !== 'priority') {
                        const catWeight = category.weight_percentage || 0
                        displayedScore = score * (indicator.weight_percentage / 100) * (catWeight / 100)
                      }

                      return (
                        <div key={indicator.id} className="border rounded-lg p-4 space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{indicator.name}</h4>
                              <p className="text-sm text-gray-600">Kode: {indicator.code}</p>
                              {indicator.description && (
                                <p className="text-sm text-gray-500 mt-1">{indicator.description}</p>
                              )}
                            </div>
                            {!isMedicalUnit && (
                              <div className="flex gap-2 ml-4">
                                {indicator.calculation_method === 'priority' ? (
                                  <Badge variant="default" className="bg-purple-600">
                                    Prioritas
                                  </Badge>
                                ) : (
                                  category.is_weighted !== false && (
                                    <Badge variant="outline">
                                      Bobot: {indicator.weight_percentage}%
                                    </Badge>
                                  )
                                )}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <Label className="text-sm font-medium">Target</Label>
                              <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                                {formatDecimal(getIndicatorTarget(indicator), 4)}
                                {indicator.measurement_unit && ` ${indicator.measurement_unit}`}
                              </div>
                            </div>

                            {!hasSubIndicators ? (
                              <div>
                                <Label htmlFor={`realization-${indicator.id}`} className="text-sm font-medium">
                                  Realisasi
                                </Label>
                                <Input
                                  id={`realization-${indicator.id}`}
                                  type="number"
                                  step="0.0001"
                                  value={realizationValue || ''}
                                  onChange={(e) => handleRealizationChange(indicator.id, e.target.value, indicator.target_value)}
                                  placeholder="0.0000"
                                  className="mt-1"
                                />
                              </div>
                            ) : (
                              <div className="bg-gray-50 p-2 rounded border">
                                <Label className="text-xs text-gray-500">Summary Realisasi</Label>
                                <div className="text-sm font-semibold">Multiple Sub-items</div>
                              </div>
                            )}

                            <div>
                              <Label className="text-sm font-medium">Pencapaian</Label>
                              <div className="mt-1 p-2 rounded border flex items-center gap-2">
                                <TrendingUp className={cn("h-4 w-4", getAchievementColor(achievementPct))} />
                                <span className={cn("font-semibold", getAchievementColor(achievementPct))}>
                                  {achievementPct.toFixed(2)}%
                                </span>
                              </div>
                            </div>

                            <div>
                              <Label className="text-sm font-medium">Skor Dasar</Label>
                              <div className="mt-1">
                                <Badge className={getAchievementBadge(displayedScore)}>
                                  {displayedScore.toFixed(2)}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* Render Sub-Indicators if any */}
                          {hasSubIndicators && (
                            <div className="mt-4 pt-4 border-t space-y-3">
                              <Label className="text-sm font-bold text-blue-800">Evaluasi Sub-Indikator</Label>
                              <div className="grid gap-3">
                                {indicator.sub_indicators.map((sub) => {
                                  const subAssessment = assessment?.sub_assessments?.find(sa => sa.sub_indicator_id === sub.id)
                                  // Fallback: if no sub_assessment found and indicator has 1 sub-indicator,
                                  // use the main assessment's realization_value (orphan main row scenario)
                                  const subRealization = subAssessment?.realization_value
                                    ?? ((!subAssessment && indicator.sub_indicators.length === 1 && assessment?.realization_value) ? assessment.realization_value : 0)
                                  const isQuantitative = sub.measurement_type === 'quantitative'
                                  let subScore = subAssessment?.score ?? ((!subAssessment && indicator.sub_indicators.length === 1 && assessment?.score) ? assessment.score : 0)

                                  if (subAssessment && !subAssessment.score && subRealization > 0) {
                                    if (isQuantitative) {
                                      subScore = subRealization * (sub.base_index_value || 1)
                                    } else {
                                      subScore = subRealization
                                    }
                                  }

                                  const hasCriteria = !isQuantitative && sub.scoring_criteria && sub.scoring_criteria.length > 0

                                  return (
                                    <div key={sub.id} className="bg-blue-50/30 p-3 rounded-lg border border-blue-100">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <p className="text-sm font-medium text-gray-800">{sub.name}</p>
                                          <p className="text-xs text-gray-500">
                                            {!isMedicalUnit && `Bobot: ${sub.weight_percentage}%`}
                                            {sub.target_value > 0 && ` • Target: ${sub.target_value}`}
                                            {isQuantitative && ` • Satuan: ${sub.measurement_unit || 'Volume'} • Tarif Dasar / Indeks: ${(sub.base_index_value || 0) >= 1000 ? 'Rp ' + (sub.base_index_value || 0).toLocaleString('id-ID') : formatDecimal(sub.base_index_value || 0, 4)}`}
                                          </p>
                                        </div>
                                        <Badge 
                                          variant="outline" 
                                          className={cn(
                                            "text-xs transition-colors",
                                            (subAssessment !== undefined || subRealization > 0)
                                              ? "bg-blue-100 text-blue-800 border-blue-300 font-semibold"
                                              : "bg-white text-gray-500 border-gray-200"
                                          )}
                                        >
                                          {isQuantitative ? `Volume: ${subRealization}` : `Skor: ${subScore.toFixed(2)}`}
                                        </Badge>
                                      </div>

                                      {isQuantitative ? (
                                        <div className="space-y-3">
                                          {sub.tariffs && sub.tariffs.length > 0 ? (
                                            <div className="grid gap-2 border rounded-md p-2 bg-white/50">
                                              <Label className="text-[10px] font-bold text-blue-800 uppercase px-1">Daftar Layanan ({sub.tariffs.length})</Label>
                                              {sub.tariffs.map((tariff) => {
                                                return (
                                                  <div key={tariff.id} className="flex items-center gap-2 bg-white p-2 rounded border border-blue-50 shadow-sm">
                                                    <div className="flex-1">
                                                      <p className="text-xs font-semibold">{tariff.name}</p>
                                                      <p className="text-[10px] text-gray-500">Tarif: Rp {tariff.tariff.toLocaleString('id-ID')}</p>
                                                    </div>
                                                    <div className="w-24">
                                                      <Input
                                                        type="number"
                                                        step="0.0001"
                                                        placeholder="Vol"
                                                        className="h-7 text-xs"
                                                        onChange={(e) => {
                                                          const vol = parseFloat(e.target.value) || 0
                                                          const container = e.target.closest('.grid');
                                                          if (container) {
                                                            const inputs = container.querySelectorAll('input');
                                                            let subIndicatorTotal = 0;
                                                            inputs.forEach((input: any, idx) => {
                                                              const t = sub.tariffs![idx];
                                                              const v = parseFloat(input.value) || 0;
                                                              subIndicatorTotal += v * t.tariff;
                                                            });

                                                            const category = categories.find(c => c.indicators.some(i => i.id === indicator.id))
                                                            const isActivity = category?.configuration_style === 'activity'
                                                            let calculatedScore = 0
                                                            if (isActivity) {
                                                              calculatedScore = subIndicatorTotal
                                                            } else {
                                                              calculatedScore = subIndicatorTotal * (sub.base_index_value || 1)
                                                            }

                                                            handleSubAssessmentChange(indicator.id, sub.id, subIndicatorTotal, calculatedScore)
                                                          }
                                                        }}
                                                      />
                                                    </div>
                                                  </div>
                                                )
                                              })}
                                              <div className="flex justify-between items-center px-1 mt-1 border-t pt-2">
                                                <Label className="text-[10px] font-bold">TOTAL REALISASI</Label>
                                                <div className="text-sm font-bold text-blue-700">
                                                  Rp {subRealization.toLocaleString('id-ID')}
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2">
                                              <div className="flex-1">
                                                <Label className="text-[10px] text-gray-500 mb-1 block">Input Volume ({sub.measurement_unit || 'qty'})</Label>
                                                <Input
                                                  type="number"
                                                  step="0.0001"
                                                  className="h-8 text-sm bg-white"
                                                  placeholder="0.0000"
                                                  value={subRealization || ''}
                                                  onChange={(e) => {
                                                    const vol = parseFloat(e.target.value) || 0
                                                    const sTariff = sub.base_index_value || 0
                                                    const calculatedScore = vol * sTariff

                                                    handleSubAssessmentChange(indicator.id, sub.id, vol, calculatedScore)
                                                  }}
                                                />
                                              </div>
                                              <div className="w-1/3">
                                                <Label className="text-[10px] text-gray-500 mb-1 block">Hasil Skor/Nilai</Label>
                                                <div className="h-8 text-xs bg-gray-100 border rounded flex items-center px-2 font-medium">
                                                  {subScore.toLocaleString('id-ID')}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : hasCriteria ? (
                                        <div className="flex flex-col gap-1.5 mt-1">
                                          {(() => {
                                            const anyMatched = sub.scoring_criteria.some(c => Math.abs(Number(subRealization) - Number(c.score)) < 0.001)
                                            if (!anyMatched && subRealization > 0) {
                                              return (
                                                <div className="w-full mb-1">
                                                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                                                    Nilai sebelumnya: {subRealization} (pilih salah satu opsi untuk memperbarui)
                                                  </span>
                                                </div>
                                              )
                                            }
                                            return null
                                          })()}
                                          <div className="flex flex-wrap gap-2">
                                            {sub.scoring_criteria.map((criterion, cIdx) => {
                                              const isSelected = Math.abs(Number(subRealization) - Number(criterion.score)) < 0.001
                                              return (
                                                <Button
                                                  key={cIdx}
                                                  type="button"
                                                  variant={isSelected ? 'default' : 'outline'}
                                                  size="sm"
                                                  className={cn(
                                                    "h-8 text-xs px-2.5 font-medium transition-all",
                                                    isSelected
                                                      ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-sm ring-2 ring-blue-400 font-semibold"
                                                      : "bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 border-gray-200"
                                                  )}
                                                  onClick={() => handleSubAssessmentChange(indicator.id, sub.id, criterion.score, criterion.score)}
                                                >
                                                  {criterion.label} ({criterion.score})
                                                </Button>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-1">
                                          <Label className="text-[10px] text-gray-500 mb-1 block">Input Nilai Pencapaian (%)</Label>
                                          <Input
                                            type="number"
                                            className="h-8 text-sm mt-1 bg-white"
                                            placeholder="Ketik nilai..."
                                            value={subRealization || ''}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value) || 0
                                              const sTarget = sub.target_value || 100
                                              const sScore = (val / sTarget) * 100
                                              handleSubAssessmentChange(indicator.id, sub.id, val, sScore)
                                            }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          <div>
                            <Label htmlFor={`notes-${indicator.id}`} className="text-sm font-medium">
                              Catatan (Opsional)
                            </Label>
                            <Textarea
                              id={`notes-${indicator.id}`}
                              value={assessment?.notes || ''}
                              onChange={(e) => handleNotesChange(indicator.id, e.target.value)}
                              placeholder="Tambahkan catatan penilaian..."
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t w-full">
          {activeRevenueType === 'bpjs' ? (
            <div className="flex items-center gap-2 bg-blue-50/70 text-blue-900 border border-blue-200 px-3 py-2 rounded-lg text-xs font-medium">
              <input
                type="checkbox"
                id="applyToUmumCheckbox"
                checked={applyToUmum}
                onChange={(e) => setApplyToUmum(e.target.checked)}
                className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="applyToUmumCheckbox" className="cursor-pointer select-none">
                Terapkan nilai penilaian ini secara otomatis untuk <span className="font-bold underline">Pendapatan UMUM</span>
              </label>
            </div>
          ) : (
            <div className="flex-1 text-xs text-amber-700 font-medium">
              • Penilaian ini khusus untuk Pendapatan UMUM (Pool UMUM & Proporsi UMUM)
            </div>
          )}
          <div className="flex gap-2 items-center self-end sm:self-auto">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              {isApproved ? 'Tutup' : 'Batal'}
            </Button>
            {isApproved ? (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md text-xs font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Periode Terkunci (Disetujui)
              </div>
            ) : (
              <Button onClick={handleSave} disabled={saving || loading}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Menyimpan...' : 'Simpan Penilaian'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}