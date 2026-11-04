'use client'

import { useState, useEffect, useMemo, memo } from 'react'
import { ChevronDown, ChevronRight, Edit, Trash2, Plus, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatNumber, formatCurrency, formatDecimal } from '@/lib/utils/format'
import type { KPICategory, KPIIndicator, KPISubIndicator } from '@/lib/types/kpi.types'

interface KPITreeProps {
  categories: KPICategory[]
  indicators: KPIIndicator[]
  subIndicators: KPISubIndicator[]
  onEditCategory: (category: KPICategory) => void
  onDeleteCategory: (categoryId: string) => void
  onAddIndicator: (categoryId: string) => void
  onEditIndicator: (indicator: KPIIndicator) => void
  onDeleteIndicator: (indicatorId: string) => void
  onAddSubIndicator: (indicatorId: string) => void
  onEditSubIndicator: (subIndicator: KPISubIndicator) => void
  onDeleteSubIndicator: (subIndicatorId: string) => void
  isReadOnly?: boolean
}

const KPITree = memo(function KPITree({
  categories,
  indicators,
  subIndicators,
  onEditCategory,
  onDeleteCategory,
  onAddIndicator,
  onEditIndicator,
  onDeleteIndicator,
  onAddSubIndicator,
  onEditSubIndicator,
  onDeleteSubIndicator,
  isReadOnly = false
}: KPITreeProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedIndicators, setExpandedIndicators] = useState<Set<string>>(new Set())

  // OPTIMIZED: Memoize expanded states to prevent unnecessary re-renders
  const expandedCategoryIds = useMemo(() =>
    new Set(categories.map(c => c.id)),
    [categories]
  )

  const expandedIndicatorIds = useMemo(() => {
    const indicatorsWithSubs = indicators.filter(indicator =>
      subIndicators.some(sub => sub.indicator_id === indicator.id)
    )
    return new Set(indicatorsWithSubs.map(i => i.id))
  }, [indicators, subIndicators])

  // Update state only when memoized values change
  useEffect(() => {
    setExpandedCategories(expandedCategoryIds)
  }, [expandedCategoryIds])

  useEffect(() => {
    setExpandedIndicators(expandedIndicatorIds)
  }, [expandedIndicatorIds])

  function toggleCategory(categoryId: string) {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  function toggleIndicator(indicatorId: string) {
    const newExpanded = new Set(expandedIndicators)
    if (newExpanded.has(indicatorId)) {
      newExpanded.delete(indicatorId)
    } else {
      newExpanded.add(indicatorId)
    }
    setExpandedIndicators(newExpanded)
  }

  // Memoize grouped indicators by category
  const indicatorsByCategory = useMemo(() => {
    const map = new Map<string, KPIIndicator[]>()
    categories.forEach(c => map.set(c.id, []))
    indicators.forEach(i => {
      if (map.has(i.category_id)) {
        map.get(i.category_id)!.push(i)
      } else {
        map.set(i.category_id, [i])
      }
    })
    return map
  }, [categories, indicators])

  // Memoize grouped sub-indicators by indicator
  const subIndicatorsByIndicator = useMemo(() => {
    const map = new Map<string, KPISubIndicator[]>()
    indicators.forEach(i => map.set(i.id, []))
    subIndicators.forEach(s => {
      if (map.has(s.indicator_id)) {
        map.get(s.indicator_id)!.push(s)
      } else {
        map.set(s.indicator_id, [s])
      }
    })
    return map
  }, [indicators, subIndicators])

  function getCategoryIndicators(categoryId: string) {
    return indicatorsByCategory.get(categoryId) || []
  }

  function getIndicatorSubIndicators(indicatorId: string) {
    return subIndicatorsByIndicator.get(indicatorId) || []
  }

  function calculateIndicatorWeightSum(categoryId: string) {
    const categoryIndicators = getCategoryIndicators(categoryId)
    return categoryIndicators.reduce((sum, ind) => sum + (Number(ind.weight_percentage) || 0), 0)
  }

  function calculateSubIndicatorWeightSum(indicatorId: string) {
    const subs = getIndicatorSubIndicators(indicatorId)
    return subs.reduce((sum, s) => sum + (Number(s.weight_percentage) || 0), 0)
  }

  function calculateCategoryWeightSum() {
    return categories.reduce((sum, cat) => sum + (Number(cat.weight_percentage) || 0), 0)
  }

  const categoryWeightSum = calculateCategoryWeightSum()
  const isValidCategorySum = Math.abs(categoryWeightSum - 100) <= 0.01

  if (categories.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Belum ada kategori KPI untuk unit ini.</p>
        <p className="text-sm mt-2">Klik &quot;Tambah Kategori&quot; untuk membuat kategori P1, P2, atau P3.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Category Weight Sum Validation - only show if there are weighted categories */}
      {categories.some(c => c.is_weighted !== false) && (
        <div className={`p-3 rounded-lg ${isValidCategorySum ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <p className={`text-sm font-medium ${isValidCategorySum ? 'text-green-800' : 'text-red-800'}`}>
            Total Bobot Kategori (Tertimbang): {formatNumber(categoryWeightSum, 2)}%
            {isValidCategorySum ? ' ✓' : ' (Harus sama dengan 100%)'}
          </p>
        </div>
      )}

      {/* Categories */}
      {categories.map(category => {
        const isExpanded = expandedCategories.has(category.id)
        const categoryIndicators = getCategoryIndicators(category.id)
        const indicatorWeightSum = calculateIndicatorWeightSum(category.id)
        const isValidIndicatorSum = Math.abs(indicatorWeightSum - 100) <= 0.01

        return (
          <div key={category.id} className="border rounded-lg overflow-hidden">
            {/* Category Header */}
            <div className="p-4 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-lg">{category.category}</span>
                    <span className="text-gray-700">{category.category_name}</span>
                    {category.is_weighted !== false ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                        {formatNumber(category.weight_percentage || 0, 2)}%
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-sm font-medium">
                        Tanpa Bobot
                      </span>
                    )}
                  </div>
                  {category.description && (
                    <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                  )}
                  {categoryIndicators.length > 0 && category.is_weighted !== false && (
                    <p className={`text-xs mt-1 ${isValidIndicatorSum ? 'text-green-600' : 'text-red-600'}`}>
                      Bobot indikator: {formatNumber(indicatorWeightSum, 2)}%
                      {isValidIndicatorSum ? ' ✓' : ' (Harus sama dengan 100%)'}
                    </p>
                  )}
                </div>
              </div>
              {!isReadOnly && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAddIndicator(category.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Tambah Indikator
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEditCategory(category)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeleteCategory(category.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              )}
            </div>

            {/* Indicators */}
            {isExpanded && (
              <div className="p-4 space-y-2">
                {categoryIndicators.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Belum ada indikator. Klik &quot;Tambah Indikator&quot; untuk membuat indikator baru.
                  </p>
                ) : (
                  categoryIndicators.map(indicator => {
                    const isIndicatorExpanded = expandedIndicators.has(indicator.id)
                    const indicatorSubs = getIndicatorSubIndicators(indicator.id)
                    const subWeightSum = calculateSubIndicatorWeightSum(indicator.id)
                    const isValidSubSum = indicatorSubs.length === 0 || Math.abs(subWeightSum - 100) <= 0.01

                    return (
                      <div key={indicator.id} className="border rounded-lg overflow-hidden">
                        {/* Indicator Row */}
                        <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50">
                          <div className="flex items-center gap-3 flex-1">
                            {/* Expand/collapse button for sub indicators */}
                            <button
                              onClick={() => toggleIndicator(indicator.id)}
                              className="p-1 hover:bg-gray-200 rounded"
                            >
                              {isIndicatorExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                              )}
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm text-gray-600">{indicator.code}</span>
                                <span className="font-medium">{indicator.name}</span>
                                {category.is_weighted !== false && indicator.calculation_method !== 'priority' && (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                                    {formatNumber(indicator.weight_percentage || 0, 2)}%
                                  </span>
                                )}
                                {indicator.calculation_method === 'priority' && (
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                                    Prioritas
                                  </span>
                                )}
                                {indicatorSubs.length > 0 && (
                                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                                    <Layers className="h-3 w-3 inline mr-1" />
                                    {indicatorSubs.length} sub indikator
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-4 mt-1 text-sm text-gray-600 flex-wrap items-center">
                                <span>Target: {formatDecimal(indicator.target_value || 0, 4)}</span>
                                {indicator.measurement_unit && (
                                  <span>Satuan: {indicator.measurement_unit}</span>
                                )}
                                {indicatorSubs.length === 0 && (indicator.calculation_method === 'priority' || indicator.measurement_type === 'quantitative' || category.configuration_style === 'activity') && indicator.base_index_value !== undefined && indicator.base_index_value !== null && Number(indicator.base_index_value) > 0 && (
                                  <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs">
                                    Tarif Dasar / Indeks: {Number(indicator.base_index_value) >= 1000 ? formatCurrency(indicator.base_index_value) : formatDecimal(indicator.base_index_value, 4)}
                                  </span>
                                )}
                              </div>
                              {indicator.description && (
                                <p className="text-xs text-gray-500 mt-1">{indicator.description}</p>
                              )}
                              {indicatorSubs.length > 0 && category.is_weighted !== false && indicator.calculation_method !== 'priority' && (
                                <p className={`text-xs mt-1 ${isValidSubSum ? 'text-green-600' : 'text-amber-600'}`}>
                                  Bobot sub indikator: {formatNumber(subWeightSum, 2)}%
                                  {isValidSubSum ? ' ✓' : ' (Harus sama dengan 100%)'}
                                </p>
                              )}
                            </div>
                          </div>
                          {!isReadOnly && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onAddSubIndicator(indicator.id)}
                                title="Tambah Sub Indikator"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                <span className="text-xs">Sub</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onEditIndicator(indicator)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onDeleteIndicator(indicator.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Sub Indicators */}
                        {isIndicatorExpanded && (
                          <div className="bg-slate-50 border-t">
                            {indicatorSubs.length === 0 ? (
                              <p className="text-sm text-gray-400 text-center py-3 px-4">
                                Belum ada sub indikator.
                                {!isReadOnly && (
                                  <button
                                    onClick={() => onAddSubIndicator(indicator.id)}
                                    className="text-blue-600 hover:underline ml-1"
                                  >
                                    Tambah sekarang
                                  </button>
                                )}
                              </p>
                            ) : (
                              <div className="p-3 space-y-2">
                                {indicatorSubs.map(sub => (
                                  <div
                                    key={sub.id}
                                    className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-mono text-xs text-gray-500">{sub.code}</span>
                                          <span className="text-sm font-medium">{sub.name}</span>
                                          {category.is_weighted !== false && indicator.calculation_method !== 'priority' && (
                                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                                              {formatNumber(sub.weight_percentage || 0, 2)}%
                                            </span>
                                          )}
                                        </div>
                                        {/* Score badges or Quantitative Info */}
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                          {sub.measurement_type === 'quantitative' ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                                              <span className="font-bold">
                                                Tarif Dasar / Indeks: {Number(sub.base_index_value || 0) >= 1000 ? formatCurrency(sub.base_index_value || 0) : formatDecimal(sub.base_index_value || 0, 4)}
                                              </span>
                                              <span className="opacity-70">(Satuan: {sub.measurement_unit || 'Volume'})</span>
                                            </span>
                                          ) : (
                                            sub.scoring_criteria?.map((criterion, idx) => (
                                              <span
                                                key={idx}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${idx === 0 ? 'bg-red-100 text-red-700 border-red-200' :
                                                  idx === 1 ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                                    idx === 2 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                                      idx === 3 ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                        'bg-green-100 text-green-700 border-green-200'
                                                  }`}
                                                title={criterion.label}
                                              >
                                                <span className="font-bold">{formatNumber(criterion.score || 0)}</span>
                                                <span className="text-[10px] font-medium leading-none">({criterion.label})</span>
                                              </span>
                                            )) || []
                                          )}
                                        </div>
                                        {sub.description && (
                                          <p className="text-xs text-gray-500 mt-1.5">{sub.description}</p>
                                        )}
                                      </div>
                                      {!isReadOnly && (
                                        <div className="flex gap-1 ml-2 shrink-0">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onEditSubIndicator(sub)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Edit className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              onDeleteSubIndicator(sub.id)
                                            }}
                                            className="h-7 w-7 p-0 hover:bg-red-50"
                                            title="Hapus Sub Indikator"
                                          >
                                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})

export default KPITree
