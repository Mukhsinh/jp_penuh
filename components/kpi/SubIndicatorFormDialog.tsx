'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSubIndicator, updateSubIndicator } from '@/app/actions/sub-indicator-actions'
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
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react'
import type { KPIIndicator, KPISubIndicator, ScoringCriterion } from '@/lib/types/kpi.types'

interface SubIndicatorFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    subIndicator: KPISubIndicator | null
    indicator: KPIIndicator | null
    existingSubIndicators: KPISubIndicator[]
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

export default function SubIndicatorFormDialog({
    open,
    onOpenChange,
    subIndicator,
    indicator,
    existingSubIndicators,
    onSuccess,
    isMedicalUnit = false
}: SubIndicatorFormDialogProps) {
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        weight_percentage: '',
        target_value: '0',
        measurement_unit: '',
        scoring_criteria: [
            { score: 20, label: 'Sangat Kurang' },
            { score: 40, label: 'Kurang' },
            { score: 60, label: 'Cukup' },
            { score: 80, label: 'Baik' },
            { score: 100, label: 'Sangat Baik' }
        ] as ScoringCriterion[],
        measurement_type: 'scoring' as 'scoring' | 'quantitative',
        unit_tariff: '',
        base_index_value: '',
        service_types: [] as string[]
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    useEffect(() => {
        if (subIndicator) {
            setFormData({
                name: subIndicator.name,
                description: subIndicator.description || '',
                weight_percentage: subIndicator.weight_percentage.toString(),
                target_value: subIndicator.target_value?.toString() || '0',
                measurement_unit: subIndicator.measurement_unit || '',
                scoring_criteria: subIndicator.scoring_criteria || [
                    { score: 20, label: 'Sangat Kurang' },
                    { score: 40, label: 'Kurang' },
                    { score: 60, label: 'Cukup' },
                    { score: 80, label: 'Baik' },
                    { score: 100, label: 'Sangat Baik' }
                ],
                measurement_type: (subIndicator.measurement_type as any) || 'scoring',
                unit_tariff: subIndicator.unit_tariff?.toString() || '',
                base_index_value: subIndicator.base_index_value !== undefined && subIndicator.base_index_value !== null
                    ? (Number(subIndicator.base_index_value) < 100 && Number(subIndicator.base_index_value) % 1 !== 0
                        ? Number(subIndicator.base_index_value).toFixed(4)
                        : subIndicator.base_index_value.toString())
                    : '',
                service_types: subIndicator.service_types || []
            })
        } else {
            setFormData({
                name: '',
                description: '',
                weight_percentage: '',
                target_value: '0',
                measurement_unit: '',
                scoring_criteria: [
                    { score: 20, label: 'Sangat Kurang' },
                    { score: 40, label: 'Kurang' },
                    { score: 60, label: 'Cukup' },
                    { score: 80, label: 'Baik' },
                    { score: 100, label: 'Sangat Baik' }
                ],
                measurement_type: 'scoring',
                unit_tariff: '',
                base_index_value: '',
                service_types: []
            })
        }
        setErrors({})
    }, [subIndicator, open])

    function getTotalWeightInfo(): { total: number; isValid: boolean; message: string } {
        const weight = parseFloat(formData.weight_percentage) || 0
        const others = existingSubIndicators.filter(s => s.id !== subIndicator?.id)
        const otherWeightsSum = others.reduce((sum, s) => sum + Number(s.weight_percentage), 0)
        const totalWeight = otherWeightsSum + weight
        const isValid = Math.abs(totalWeight - 100) < 0.01

        return {
            total: totalWeight,
            isValid,
            message: isValid
                ? `Total bobot: ${totalWeight.toFixed(2)}% ✓`
                : `Total bobot: ${totalWeight.toFixed(2)}% (target 100%)`
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
            newErrors.name = 'Nama sub indikator wajib diisi'
        }

        if (!isMedicalUnit && !formData.weight_percentage) {
            newErrors.weight_percentage = 'Bobot wajib diisi'
        } else if (!isMedicalUnit) {
            const weight = parseFloat(formData.weight_percentage)
            if (isNaN(weight) || weight <= 0) {
                newErrors.weight_percentage = 'Bobot harus lebih besar dari 0'
            } else if (weight > 100) {
                newErrors.weight_percentage = 'Bobot tidak boleh lebih dari 100%'
            } else {
                const others = existingSubIndicators.filter(s => s.id !== subIndicator?.id)
                const otherWeightsSum = others.reduce((sum, s) => sum + Number(s.weight_percentage), 0)
                const totalWeight = otherWeightsSum + weight

                if (totalWeight > 100.01) {
                    newErrors.weight_percentage = `Total bobot akan menjadi ${totalWeight.toFixed(2)}% (maksimal 100%)`
                }
            }
        }

        if (formData.target_value && isNaN(parseFloat(formData.target_value))) {
            newErrors.target_value = 'Nilai target harus berupa angka'
        }

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

                const scores = formData.scoring_criteria.map(c => c.score)
                const duplicateScores = scores.filter((score, index) => scores.indexOf(score) !== index)
                if (duplicateScores.length > 0) {
                    newErrors.scoring_criteria = 'Skor kriteria tidak boleh sama'
                }
            }
        } else if (formData.measurement_type === 'quantitative') {
            const rawVal = formData.base_index_value ? formData.base_index_value.toString().replace(',', '.').trim() : '0'
            const baseVal = parseFloat(rawVal)
            if (baseVal <= 0) {
                newErrors.base_index_value = 'Tarif Dasar / Nilai Indeks harus lebih besar dari 0'
            }
            if (isMedicalUnit && formData.service_types.length === 0) {
                newErrors.service_types = 'Minimal harus ada satu jenis layanan yang dipilih'
            }
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (!validateForm()) return
        if (!indicator && !subIndicator) return

        setIsSubmitting(true)

        try {
            const data = {
                indicator_id: subIndicator?.indicator_id || indicator?.id!,
                name: formData.name.trim(),
                description: formData.description.trim() || undefined,
                weight_percentage: isMedicalUnit ? 0 : parseFloat(formData.weight_percentage),
                target_value: formData.target_value ? parseFloat(formData.target_value) : 0,
                measurement_unit: formData.measurement_unit.trim() || undefined,
                scoring_criteria: formData.scoring_criteria,
                measurement_type: formData.measurement_type,
                unit_tariff: formData.unit_tariff ? parseFloat(formData.unit_tariff.toString().replace(',', '.').trim()) : undefined,
                base_index_value: formData.base_index_value ? parseFloat(formData.base_index_value.toString().replace(',', '.').trim()) : undefined,
                service_types: formData.service_types
            }

            let result
            if (subIndicator) {
                result = await updateSubIndicator(subIndicator.id, data)
            } else {
                result = await createSubIndicator(data)
            }

            if (result.success) {
                onSuccess()
                onOpenChange(false)
            } else {
                throw new Error(result.error)
            }
        } catch (error: any) {
            console.error('Error saving sub indicator:', error)
            alert(error.message || 'Gagal menyimpan sub indikator')
        } finally {
            setIsSubmitting(false)
        }
    }

    const weightInfo = getTotalWeightInfo()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] flex flex-col max-h-[90vh] p-0 overflow-hidden">
                <form onSubmit={handleSubmit} className="flex flex-col min-h-0 h-full">
                    <DialogHeader className="p-6 pb-2 border-b flex-shrink-0">
                        <DialogTitle>{subIndicator ? 'Ubah Sub Indikator' : 'Tambah Sub Indikator'}</DialogTitle>
                        <DialogDescription>
                            {subIndicator
                                ? 'Perbarui informasi sub indikator'
                                : `Buat sub indikator baru untuk ${indicator?.name}`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="sub_name">Nama Sub Indikator *</Label>
                                <Input
                                    id="sub_name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Masukkan nama sub indikator"
                                    className={errors.name ? 'border-red-500' : ''}
                                />
                                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {!isMedicalUnit && (
                                    <div className="space-y-2">
                                        <Label htmlFor="sub_weight">Bobot (%) *</Label>
                                        <Input
                                            id="sub_weight"
                                            type="number"
                                            step="0.01"
                                            value={formData.weight_percentage}
                                            onChange={(e) => setFormData({ ...formData, weight_percentage: e.target.value })}
                                            placeholder="0.00"
                                            className={errors.weight_percentage ? 'border-red-500' : ''}
                                        />
                                        {errors.weight_percentage ? (
                                            <p className="text-xs text-red-500">{errors.weight_percentage}</p>
                                        ) : (
                                            <p className={`text-xs ${weightInfo.isValid ? 'text-green-600' : 'text-blue-600'}`}>
                                                {weightInfo.message}
                                            </p>
                                        )}
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="sub_target">Target Nilai</Label>
                                    <Input
                                        id="sub_target"
                                        type="number"
                                        step="0.0001"
                                        value={formData.target_value}
                                        onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                                        placeholder="0.0000"
                                        className={errors.target_value ? 'border-red-500' : ''}
                                    />
                                    {errors.target_value && <p className="text-xs text-red-500">{errors.target_value}</p>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="sub_unit">Satuan Pengukuran</Label>
                                <Input
                                    id="sub_unit"
                                    value={formData.measurement_unit}
                                    onChange={(e) => setFormData({ ...formData, measurement_unit: e.target.value })}
                                    placeholder="contoh: %, Dokumen, Jam, dsb."
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="sub_description">Deskripsi</Label>
                                <Textarea
                                    id="sub_description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Deskripsi opsional"
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-4 border-t pt-4">
                                <div className="space-y-2">
                                    <Label htmlFor="measurement_type">Kriteria Pengukuran *</Label>
                                    <select
                                        id="measurement_type"
                                        value={formData.measurement_type}
                                        onChange={(e) => setFormData({ ...formData, measurement_type: e.target.value as 'scoring' | 'quantitative' })}
                                        className="w-full px-3 py-2 border rounded-md"
                                    >
                                        <option value="scoring">Pemberian Skor (seperti biasa)</option>
                                        <option value="quantitative">Nilai Kuantitatif (Volume × Tarif/Indeks)</option>
                                    </select>
                                </div>

                                {formData.measurement_type === 'quantitative' && (
                                    <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                                        <div className="space-y-2">
                                            <Label htmlFor="base_index_value">Tarif Dasar / Nilai Indeks *</Label>
                                            <Input
                                                id="base_index_value"
                                                type="text"
                                                inputMode="decimal"
                                                value={formData.base_index_value}
                                                onChange={(e) => setFormData({ ...formData, base_index_value: e.target.value })}
                                                placeholder="contoh: 150000 atau 0.0025 atau 0,0025"
                                                className={errors.base_index_value ? 'border-red-500' : ''}
                                            />
                                            {errors.base_index_value && <p className="text-xs text-red-500">{errors.base_index_value}</p>}
                                            <p className="text-xs text-gray-500">Nilai tarif/indeks ini akan dikalikan dengan volume capaian (dapat diisi bilangan bulat maupun desimal hingga 4 digit di belakang koma/titik, contoh: 0.0025 atau 0,0025).</p>
                                        </div>

                                        {isMedicalUnit && (
                                            <div className="space-y-3 pt-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="font-bold">Jenis Layanan *</Label>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-xs"
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

                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white p-3 rounded border">
                                                    {SERVICE_TYPES.map((type) => (
                                                        <div key={type} className="flex items-center space-x-2">
                                                            <input
                                                                type="checkbox"
                                                                id={`st-${type}`}
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
                                                            <label htmlFor={`st-${type}`} className="text-xs text-gray-700 cursor-pointer">
                                                                {type}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                                {errors.service_types && <p className="text-xs text-red-500">{errors.service_types}</p>}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {formData.measurement_type === 'scoring' && (
                                    <div className="space-y-4 border-t pt-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <Label className="text-base font-semibold">Kriteria Pengukuran Nilai/Skor</Label>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    Tentukan kriteria penilaian untuk setiap level skor.
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={addScoringCriterion}
                                                className="flex items-center gap-2"
                                            >
                                                <Plus className="h-4 w-4" />
                                                Tambah Kriteria
                                            </Button>
                                        </div>
                                        {errors.scoring_criteria && <p className="text-sm text-red-600 mt-2">{errors.scoring_criteria}</p>}

                                        <div className="space-y-3">
                                            {formData.scoring_criteria.map((criterion, index) => (
                                                <div key={index} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg bg-gray-50 group hover:border-blue-200 transition-all shadow-sm">
                                                    <div className="col-span-1 flex flex-col gap-1 pt-1">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => moveScoringCriterion(index, 'up')}
                                                            disabled={index === 0}
                                                            className="h-6 w-6 p-0 hover:bg-blue-50"
                                                            title="Geser Naik"
                                                        >
                                                            <ArrowUp className="h-3 w-3 text-gray-500" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => moveScoringCriterion(index, 'down')}
                                                            disabled={index === formData.scoring_criteria.length - 1}
                                                            className="h-6 w-6 p-0 hover:bg-blue-50"
                                                            title="Geser Turun"
                                                        >
                                                            <ArrowDown className="h-3 w-3 text-gray-500" />
                                                        </Button>
                                                    </div>
                                                    <div className="col-span-3 space-y-1">
                                                        <Label className="text-xs">Skor</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={criterion.score}
                                                            onChange={(e) => updateScoringCriterion(index, 'score', e.target.value)}
                                                            className={`h-9 ${errors[`score_${index}`] ? 'border-red-500' : 'focus:ring-1 focus:ring-blue-500'}`}
                                                        />
                                                        {errors[`score_${index}`] && <p className="text-[10px] text-red-500">{errors[`score_${index}`]}</p>}
                                                    </div>
                                                    <div className="col-span-6 space-y-1">
                                                        <Label className="text-xs">Label / Kriteria</Label>
                                                        <Input
                                                            value={criterion.label}
                                                            onChange={(e) => updateScoringCriterion(index, 'label', e.target.value)}
                                                            className={`h-9 ${errors[`label_${index}`] ? 'border-red-500' : 'focus:ring-1 focus:ring-blue-500'}`}
                                                            placeholder="Deskripsi kriteria"
                                                        />
                                                        {errors[`label_${index}`] && <p className="text-[10px] text-red-500">{errors[`label_${index}`]}</p>}
                                                    </div>
                                                    <div className="col-span-2 flex items-end justify-center pt-6">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeScoringCriterion(index)}
                                                            disabled={formData.scoring_criteria.length <= 1}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-9 w-9 p-0"
                                                            title="Hapus"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-start gap-2 bg-yellow-50 p-3 rounded-md border border-yellow-100">
                                            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                                            <p className="text-xs text-yellow-800">
                                                Skor ini digunakan untuk memetakan capaian ke nilai indeks dalam perhitungan remunerasi.
                                            </p>
                                        </div>
                                    </div>
                                )}
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
                            {isSubmitting ? 'Menyimpan...' : subIndicator ? 'Perbarui' : 'Buat'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
