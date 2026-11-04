import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import type { KPICategory, KPIIndicator, KPISubIndicator, ScoringCriterion } from '@/lib/types/kpi.types'
import { createIndicator, updateIndicator } from '@/app/actions/indicator-actions'
import { createSubIndicator, updateSubIndicator } from '@/app/actions/sub-indicator-actions'
import { Textarea } from '@/components/ui/textarea'

interface IndicatorFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  indicator: KPIIndicator | null
  category: KPICategory | null
  existingIndicators: KPIIndicator[]
  onSuccess: () => void
  isMedicalUnit?: boolean
}

const SERVICE_TYPES = [
  'Garansi Fee',
  'Rawat Jalan',
  'Rawat Inap',
  'IBS',
  'Anestesi IBS',
  'Cathlab',
  'Patologi Klinik',
  'Patologi Anatomi',
  'Mikrobiologi Klinik',
  'Radiologi',
  'Farmasi',
  'Nutrisionis',
  'Keperawatan'
]

export default function IndicatorFormDialog({
  open,
  onOpenChange,
  indicator,
  category,
  existingIndicators,
  onSuccess,
  isMedicalUnit = false
}: IndicatorFormDialogProps) {
  const supabase = createClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubIndicators, setHasSubIndicators] = useState(false)
  const [existingSubIndicator, setExistingSubIndicator] = useState<KPISubIndicator | null>(null)

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    weight_percentage: '',
    description: '',
    indicator_base_value: '0.0000', // Renamed from basic_index_value for state
    calculation_method: 'indexing' as 'indexing' | 'priority',
    // Sub-indicator fields (used if hasSubIndicators is false)
    measurement_type: 'scoring' as 'scoring' | 'quantitative',
    scoring_criteria: [
      { score: 20, label: 'Sangat Kurang' },
      { score: 40, label: 'Kurang' },
      { score: 60, label: 'Cukup' },
      { score: 80, label: 'Baik' },
      { score: 100, label: 'Sangat Baik' }
    ] as ScoringCriterion[],
    unit_tariff: '',
    base_index_value: '',
    service_types: [] as string[],
    measurement_unit: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    async function checkSubIndicators() {
      if (indicator && open) {
        const { data } = await supabase
          .from('m_kpi_sub_indicators')
          .select('*')
          .eq('indicator_id', indicator.id)
          .eq('is_active', true)

        if (data && data.length > 0) {
          if (data.length === 1) {
            setHasSubIndicators(false)
            setExistingSubIndicator(data[0])
            setFormData(prev => ({
              ...prev,
              measurement_type: (data[0].measurement_type as 'scoring' | 'quantitative') || 'scoring',
              scoring_criteria: data[0].scoring_criteria || prev.scoring_criteria,
              unit_tariff: data[0].unit_tariff?.toString() || '',
              base_index_value: data[0].base_index_value?.toString() || '',
              service_types: data[0].service_types || [],
              measurement_unit: data[0].measurement_unit || ''
            }))
          } else {
            setHasSubIndicators(true)
            setExistingSubIndicator(null)
          }
        } else {
          setHasSubIndicators(false)
          setExistingSubIndicator(null)
        }
      } else {
        setHasSubIndicators(false)
        setExistingSubIndicator(null)
      }
    }

    if (indicator) {
      setFormData({
        code: indicator.code,
        name: indicator.name,
        weight_percentage: indicator.weight_percentage.toString(),
        description: indicator.description || '',
        indicator_base_value: indicator.base_index_value?.toString() || '0.0000',
        calculation_method: (indicator.calculation_method as 'indexing' | 'priority') || 'indexing',
        measurement_type: 'scoring',
        scoring_criteria: [
          { score: 20, label: 'Sangat Kurang' },
          { score: 40, label: 'Kurang' },
          { score: 60, label: 'Cukup' },
          { score: 80, label: 'Baik' },
          { score: 100, label: 'Sangat Baik' }
        ],
        unit_tariff: indicator.unit_tariff?.toString() || '',
        base_index_value: indicator.base_index_value?.toString() || '',
        service_types: indicator.service_types || [],
        measurement_unit: indicator.measurement_unit || ''
      })
      checkSubIndicators()
    } else {
      setFormData({
        code: '',
        name: '',
        weight_percentage: '',
        description: '',
        indicator_base_value: '0.0000',
        calculation_method: 'indexing',
        measurement_type: 'scoring',
        scoring_criteria: [
          { score: 20, label: 'Sangat Kurang' },
          { score: 40, label: 'Kurang' },
          { score: 60, label: 'Cukup' },
          { score: 80, label: 'Baik' },
          { score: 100, label: 'Sangat Baik' }
        ],
        unit_tariff: '',
        base_index_value: '',
        service_types: [],
        measurement_unit: ''
      })
      setHasSubIndicators(false)
      setExistingSubIndicator(null)
    }
    setErrors({})
  }, [indicator, open, supabase])

  function getTotalWeightInfo(): { total: number; isValid: boolean; message: string } {
    const weight = parseFloat(formData.weight_percentage) || 0
    const others = existingIndicators.filter(i => i.id !== indicator?.id && i.calculation_method !== 'priority')
    const otherWeightsSum = others.reduce((sum, i) => sum + Number(i.weight_percentage), 0)
    const totalWeight = otherWeightsSum + weight
    const isValid = Math.abs(totalWeight - 100) < 0.01

    return {
      total: totalWeight,
      isValid,
      message: isValid
        ? `Total bobot: ${totalWeight.toFixed(2)}% ✓`
        : `Total bobot: ${totalWeight.toFixed(2)}% (harus 100%)`
    }
  }

  function addScoringCriterion() {
    const newCriteria = [...formData.scoring_criteria]
    const lastScore = newCriteria.length > 0 ? newCriteria[newCriteria.length - 1].score : 0
    newCriteria.push({
      score: lastScore + 20,
      label: `Kriteria ${newCriteria.length + 1}`
    })
    setFormData({ ...formData, scoring_criteria: newCriteria })
  }

  function removeScoringCriterion(index: number) {
    if (formData.scoring_criteria.length <= 1) return
    const newCriteria = formData.scoring_criteria.filter((_, i) => i !== index)
    setFormData({ ...formData, scoring_criteria: newCriteria })
  }

  function updateScoringCriterion(index: number, field: 'score' | 'label', value: string | number) {
    const newCriteria = [...formData.scoring_criteria]
    if (field === 'score') {
      const parsed = typeof value === 'string' ? parseFloat(value) : value
      newCriteria[index].score = isNaN(parsed) ? 0 : parsed
    } else {
      newCriteria[index].label = value.toString()
    }
    setFormData({ ...formData, scoring_criteria: newCriteria })
  }

  function moveScoringCriterion(index: number, direction: 'up' | 'down') {
    const newCriteria = [...formData.scoring_criteria]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newCriteria.length) return

    const temp = newCriteria[index]
    newCriteria[index] = newCriteria[targetIndex]
    newCriteria[targetIndex] = temp
    setFormData({ ...formData, scoring_criteria: newCriteria })
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Nama indikator wajib diisi'
    }

    if (category?.is_weighted !== false && formData.calculation_method === 'indexing') {
      if (!formData.weight_percentage) {
        newErrors.weight_percentage = 'Persentase bobot wajib diisi'
      } else {
        const weight = parseFloat(formData.weight_percentage)
        if (isNaN(weight) || weight <= 0) {
          newErrors.weight_percentage = 'Bobot harus lebih besar dari 0'
        } else {
          const otherIndicators = existingIndicators.filter(
            i => i.id !== indicator?.id && i.calculation_method === 'indexing'
          )
          const otherWeightsSum = otherIndicators.reduce((sum, i) => sum + Number(i.weight_percentage), 0)
          const totalWeight = otherWeightsSum + weight

          if (totalWeight > 100.01) {
            newErrors.weight_percentage = `Total bobot akan menjadi ${totalWeight.toFixed(2)}% (maksimal 100%)`
          }
        }
      }
    }

    if (formData.calculation_method === 'priority' || category?.configuration_style === 'activity') {
      if (formData.measurement_type === 'quantitative' && (!formData.indicator_base_value || parseFloat(formData.indicator_base_value) <= 0)) {
        newErrors.indicator_base_value = 'Tarif dasar wajib diisi dan lebih besar dari 0'
      }
    }

    if (!hasSubIndicators) {
      if (formData.measurement_type === 'scoring') {
        if (formData.scoring_criteria.length === 0) {
          newErrors.scoring_criteria = 'Minimal harus ada satu kriteria penilaian'
        } else {
          formData.scoring_criteria.forEach((criterion, index) => {
            if (isNaN(criterion.score)) {
              newErrors[`score_${index}`] = `Skor kriteria ${index + 1} harus berupa angka valid`
            }
            if (!criterion.label.trim()) {
              newErrors[`label_${index}`] = `Label kriteria ${index + 1} wajib diisi`
            }
          })
        }
      } else if (formData.measurement_type === 'quantitative') {
        const rawBaseSub = formData.base_index_value ? formData.base_index_value.toString().replace(',', '.').trim() : ''
        if (!rawBaseSub || parseFloat(rawBaseSub) <= 0) {
          newErrors.base_index_value_sub = 'Tarif Dasar / Nilai Indeks harus lebih besar dari 0'
        }
        if (isMedicalUnit && formData.service_types.length === 0) {
          newErrors.service_types = 'Minimal harus ada satu jenis layanan yang dipilih'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!validateForm()) return
    if (!category && !indicator) return

    setIsSubmitting(true)

    try {
      const data = {
        category_id: indicator?.category_id || category?.id!,
        code: formData.code.trim() || undefined,
        name: formData.name.trim(),
        target_value: 0,
        weight_percentage: (category?.is_weighted === false || formData.calculation_method === 'priority') ? 0 : parseFloat(formData.weight_percentage),
        measurement_unit: null,
        description: formData.description.trim() || null,
        base_index_value: hasSubIndicators
          ? 0
          : (formData.calculation_method === 'priority' || category?.configuration_style === 'activity' || (!category && (indicator as any)?.m_kpi_categories?.configuration_style === 'activity'))
            ? parseFloat((formData.indicator_base_value || '0').toString().replace(',', '.').trim())
            : (formData.measurement_type === 'quantitative' && formData.base_index_value ? parseFloat(formData.base_index_value.toString().replace(',', '.').trim()) : 0),
        calculation_method: formData.calculation_method,
        measurement_type: formData.measurement_type,
        unit_tariff: formData.unit_tariff ? parseFloat(formData.unit_tariff.toString().replace(',', '.').trim()) : 0,
        service_types: formData.service_types
      }

      let result
      if (indicator) {
        result = await updateIndicator(indicator.id, data as any)
      } else {
        result = await createIndicator(data as any)
      }

      if (!result.success) throw new Error(result.error)
      const indicatorId = result.data.id

      if (!hasSubIndicators && indicatorId) {
        const subData = {
          indicator_id: indicatorId,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          weight_percentage: 100,
          target_value: 0,
          measurement_unit: formData.measurement_type === 'quantitative' ? formData.measurement_unit : null,
          scoring_criteria: formData.scoring_criteria,
          measurement_type: formData.measurement_type,
          unit_tariff: formData.unit_tariff ? parseFloat(formData.unit_tariff.toString().replace(',', '.').trim()) : 0,
          base_index_value: formData.base_index_value ? parseFloat(formData.base_index_value.toString().replace(',', '.').trim()) : 0,
          service_types: formData.service_types
        }

        let subResult
        if (existingSubIndicator) {
          subResult = await updateSubIndicator(existingSubIndicator.id, subData as any)
        } else {
          subResult = await createSubIndicator(subData as any)
        }

        if (!subResult.success) {
          throw new Error(subResult.error)
        }
      }

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving indicator:', error)
      alert(error.message || 'Gagal menyimpan indikator')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[90vh] p-0 overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 h-full">
          <DialogHeader className="p-6 pb-2 border-b flex-shrink-0">
            <DialogTitle>{indicator ? 'Ubah Indikator' : 'Tambah Indikator'}</DialogTitle>
            <DialogDescription>
              {indicator ? 'Perbarui informasi indikator' : `Buat indikator baru untuk ${category?.category} - ${category?.category_name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Kode Indikator *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="contoh: IND-001"
                  disabled={!!indicator}
                />
                {errors.code && (
                  <p className="text-sm text-red-600">{errors.code}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ind_name">Nama Indikator *</Label>
                <Input
                  id="ind_name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="contoh: Kedisiplinan Kerja"
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2 p-3 bg-gray-50 rounded-lg border">
                <Label className="text-sm font-semibold">Terdapat Sub Indikator?</Label>
                <select
                  value={hasSubIndicators ? 'true' : 'false'}
                  onChange={(e) => setHasSubIndicators(e.target.value === 'true')}
                  className="w-full mt-2 px-3 py-2 border rounded-md"
                  disabled={!!indicator && hasSubIndicators}
                >
                  <option value="false">Tidak Ada (Satu Nilai)</option>
                  <option value="true">Ada Sub Indikator</option>
                </select>
                <p className="text-[10px] text-gray-500 italic mt-1">
                  {hasSubIndicators
                    ? 'Anda perlu menambahkan sub-indikator secara manual setelah membuat indikator ini.'
                    : 'Sistem akan otomatis membuat sub-indikator tunggal dengan konfigurasi di bawah ini.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="calculation_method">Metode Kalkulasi *</Label>
                <select
                  id="calculation_method"
                  value={formData.calculation_method}
                  onChange={(e) => setFormData({ ...formData, calculation_method: e.target.value as 'indexing' | 'priority' })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="indexing">Indexing (Dibagi berdasarkan Porsi Pool)</option>
                  <option value="priority">Priority (Dikurangkan langsung dari Pool)</option>
                </select>
                <p className="text-xs text-gray-500">
                  Priority digunakan untuk indikator yang memiliki nilai pasti (Rupiah) yang harus dibayarkan terlebih dahulu.
                </p>
              </div>


              {/* Weight Percentage */}
              {(category?.is_weighted !== false && (indicator ? (indicator as any).m_kpi_categories?.is_weighted !== false : true)) && formData.calculation_method === 'indexing' && (
                <div className="space-y-2">
                  <Label htmlFor="weight_percentage">
                    {category?.configuration_style === 'activity' ? 'Poin Indeks (%) *' : 'Persentase Bobot (%) *'}
                  </Label>
                  <Input
                    id="weight_percentage"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="100"
                    value={formData.weight_percentage}
                    onChange={(e) => setFormData({ ...formData, weight_percentage: e.target.value })}
                    placeholder="contoh: 25.00"
                  />
                  {errors.weight_percentage && (
                    <p className="text-sm text-red-600">{errors.weight_percentage}</p>
                  )}
                  {formData.weight_percentage && !errors.weight_percentage && (() => {
                    const weightInfo = getTotalWeightInfo()
                    return (
                      <p className={`text-xs font-medium ${weightInfo.isValid ? 'text-green-600' : 'text-amber-600'}`}>
                        {weightInfo.message}
                      </p>
                    )
                  })()}
                  <p className="text-xs text-gray-500">
                    Total semua bobot indikator indexing dalam kategori ini harus sama dengan 100%.
                  </p>
                </div>
              )}

              {/* Basic Index Value (Activity or Priority) */}
              {(category?.configuration_style === 'activity' ||
                formData.calculation_method === 'priority' ||
                (indicator && (indicator as any).m_kpi_categories?.configuration_style === 'activity')) && (
                  <div className="space-y-2">
                    <Label htmlFor="indicator_base_value">Tarif Dasar / Nilai Indeks *</Label>
                    <Input
                      id="indicator_base_value"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={formData.indicator_base_value}
                      onChange={(e) => setFormData({ ...formData, indicator_base_value: e.target.value })}
                      placeholder="contoh: 0.1250 atau 150000"
                    />
                    {errors.indicator_base_value && (
                      <p className="text-sm text-red-600">{errors.indicator_base_value}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      Nilai tarif pengali atau nilai indeks/rupiah (mendukung hingga 4 digit desimal di belakang koma). Digunakan untuk metode Berbasis Aktivitas atau Priority.
                    </p>
                  </div>
                )}

              {/* INTEGRATED SUB-INDICATOR FIELDS (Shown only if hasSubIndicators is false) */}
              {!hasSubIndicators && (
                <div className="space-y-6 pt-4 border-t-2 border-dashed">
                  <div className="space-y-2">
                    <Label className="text-blue-700 font-bold uppercase text-[10px] tracking-wider">Konfigurasi Pengukuran</Label>
                    <div className="space-y-2">
                      <Label htmlFor="measurement_type">Tipe Kriteria *</Label>
                      <select
                        id="measurement_type"
                        value={formData.measurement_type}
                        onChange={(e) => setFormData({ ...formData, measurement_type: e.target.value as 'scoring' | 'quantitative' })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="scoring">Pemberian Skor (Level 1-5)</option>
                        <option value="quantitative">Nilai Kuantitatif (Volume × Tarif)</option>
                      </select>
                    </div>
                  </div>

                  {formData.measurement_type === 'quantitative' && (
                    <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="space-y-2">
                        <Label htmlFor="base_index_value_sub">Tarif Dasar / Nilai Indeks *</Label>
                        <Input
                          id="base_index_value_sub"
                          type="text"
                          inputMode="decimal"
                          value={formData.base_index_value}
                          onChange={(e) => setFormData({ ...formData, base_index_value: e.target.value })}
                          placeholder="contoh: 150000 atau 0.0025 atau 0,0025"
                        />
                        {errors.base_index_value_sub && (
                          <p className="text-sm text-red-600">{errors.base_index_value_sub}</p>
                        )}
                        <p className="text-xs text-gray-500">Nilai tarif/indeks ini akan dikalikan dengan volume capaian (dapat diisi bilangan bulat maupun desimal hingga 4 digit di belakang koma/titik, contoh: 0.0025 atau 0,0025).</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="measurement_unit_sub">Satuan Pengukuran</Label>
                        <Input
                          id="measurement_unit_sub"
                          value={formData.measurement_unit}
                          onChange={(e) => setFormData({ ...formData, measurement_unit: e.target.value })}
                          placeholder="contoh: Menit, Dokumen, Pasien"
                        />
                      </div>

                      {isMedicalUnit && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold">Jenis Layanan *</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px]"
                              onClick={() => {
                                if (formData.service_types.length === SERVICE_TYPES.length) {
                                  setFormData({ ...formData, service_types: [] })
                                } else {
                                  setFormData({ ...formData, service_types: [...SERVICE_TYPES] })
                                }
                              }}
                            >
                              {formData.service_types.length === SERVICE_TYPES.length ? 'Batal Semua' : 'Pilih Semua'}
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 bg-white p-2 rounded border max-h-[150px] overflow-y-auto">
                            {SERVICE_TYPES.map((type) => (
                              <div key={type} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`st-ind-${type}`}
                                  checked={formData.service_types.includes(type)}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    const newTypes = checked
                                      ? [...formData.service_types, type]
                                      : formData.service_types.filter(t => t !== type)
                                    setFormData({ ...formData, service_types: newTypes })
                                  }}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                />
                                <label htmlFor={`st-ind-${type}`} className="text-[10px] text-gray-700 cursor-pointer">
                                  {type}
                                </label>
                              </div>
                            ))}
                          </div>
                          {errors.service_types && (
                            <p className="text-sm text-red-600">{errors.service_types}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {formData.measurement_type === 'scoring' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase">Kriteria Skor</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addScoringCriterion}
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Tambah
                        </Button>
                      </div>
                      {errors.scoring_criteria && <p className="text-sm text-red-600">{errors.scoring_criteria}</p>}
                      <div className="space-y-2">
                        {formData.scoring_criteria.map((criterion, index) => (
                          <div key={index} className="flex gap-2 items-start p-2 border rounded-lg bg-white group hover:border-blue-200 transition-all shadow-sm">
                            <div className="w-16">
                              <Input
                                type="number"
                                value={criterion.score}
                                onChange={(e) => updateScoringCriterion(index, 'score', e.target.value)}
                                className="h-8 text-xs focus:ring-1 focus:ring-blue-500"
                                title="Skor"
                              />
                            </div>
                            <div className="flex-1">
                              <Input
                                value={criterion.label}
                                onChange={(e) => updateScoringCriterion(index, 'label', e.target.value)}
                                placeholder="Label kriteria"
                                className="h-8 text-xs focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeScoringCriterion(index)}
                              disabled={formData.scoring_criteria.length <= 1}
                              className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                              title="Hapus"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}


              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Deskripsi</Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md min-h-[80px]"
                  placeholder="Deskripsi opsional"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-2 border-t flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Menyimpan...' : indicator ? 'Perbarui' : 'Buat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
