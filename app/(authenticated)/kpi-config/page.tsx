'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Copy, Download, Building2, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react'
import type {
  KPICategory,
  KPIIndicator,
  KPISubIndicator
} from '@/lib/types/kpi.types'
import { isMedicalUnit as checkMedicalUnit } from '@/lib/utils/medical-unit'

// Direct imports instead of dynamic to fix chunk loading issues
import KPITree from '@/components/kpi/KPITree'
import CategoryFormDialog from '@/components/kpi/CategoryFormDialog'
import IndicatorFormDialog from '@/components/kpi/IndicatorFormDialog'
import SubIndicatorFormDialog from '@/components/kpi/SubIndicatorFormDialog'
import CopyStructureDialog from '@/components/kpi/CopyStructureDialog'
import CopyBPJSStructureDialog from '@/components/kpi/CopyBPJSStructureDialog'
import { getUnitsForKPI, getKPIStructure, updateUnitKPISchemaMode } from './actions'
import ExcelImportDialog from '@/components/kpi/ExcelImportDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Unit {
  id: string
  code: string
  name: string
  kpi_schema_mode?: string
}

export default function KPIConfigPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null)
  const [kpiSchemaMode, setKpiSchemaMode] = useState<'same' | 'different'>('same')
  const [savedKpiSchemaMode, setSavedKpiSchemaMode] = useState<'same' | 'different'>('same')
  const [isSavingSchemaMode, setIsSavingSchemaMode] = useState(false)
  const [activeRevenueType, setActiveRevenueType] = useState<'bpjs' | 'umum'>('bpjs')
  const [categories, setCategories] = useState<KPICategory[]>([])
  const [indicators, setIndicators] = useState<KPIIndicator[]>([])
  const [subIndicators, setSubIndicators] = useState<KPISubIndicator[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [isIndicatorDialogOpen, setIsIndicatorDialogOpen] = useState(false)
  const [isSubIndicatorDialogOpen, setIsSubIndicatorDialogOpen] = useState(false)
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false)
  const [isCopyBPJSDialogOpen, setIsCopyBPJSDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<KPICategory | null>(null)
  const [selectedIndicator, setSelectedIndicator] = useState<KPIIndicator | null>(null)
  const [selectedSubIndicator, setSelectedSubIndicator] = useState<KPISubIndicator | null>(null)
  const [selectedIndicatorForSub, setSelectedIndicatorForSub] = useState<KPIIndicator | null>(null)
  const [userMetadata, setUserMetadata] = useState<{ role?: string; unit_id?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const selectedUnitData = units.find(u => u.id === selectedUnit)
  const isMedicalUnit = checkMedicalUnit(selectedUnitData?.id, selectedUnitData?.name)
  const isSuperAdmin = userMetadata?.role === 'superadmin'
  const isUnitManager = userMetadata?.role === 'unit_manager'
  const isReadOnly = isUnitManager

  // Ensure component is mounted before loading data
  useEffect(() => {
    setMounted(true)
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const authRole = user.app_metadata?.role || user.user_metadata?.role
        const isSuperAdmin = authRole === 'superadmin' || user.email === 'admin@sungaipenuh.com'
        const role = isSuperAdmin ? 'superadmin' : (authRole || 'employee')

        setUserMetadata({
          role: role as any,
          unit_id: user.user_metadata?.unit_id || user.app_metadata?.unit_id
        })
      }
    }
    fetchUser()
  }, [])

  const loadUnits = useCallback(async () => {
    try {
      const result = await getUnitsForKPI()
      if (result.error) throw new Error(result.error)

      const filteredUnits = result.data || []

      setUnits(filteredUnits)
      if (filteredUnits.length > 0 && (!selectedUnit || !filteredUnits.find(u => u.id === selectedUnit))) {
        setSelectedUnit(filteredUnits[0].id)
        const initialMode = (filteredUnits[0].kpi_schema_mode as any) === 'different' ? 'different' : 'same'
        setKpiSchemaMode(initialMode)
        setSavedKpiSchemaMode(initialMode)
      }
    } catch (error: any) {
      console.error('Error loading units:', error)
      setError(`Gagal memuat data unit: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [selectedUnit])

  useEffect(() => {
    if (selectedUnitData) {
      const mode = (selectedUnitData.kpi_schema_mode as any) === 'different' ? 'different' : 'same'
      setKpiSchemaMode(mode)
      setSavedKpiSchemaMode(mode)
    }
  }, [selectedUnitData])

  const loadKPIStructure = useCallback(async () => {
    if (!selectedUnit) return

    setIsLoading(true)
    try {
      const revType = kpiSchemaMode === 'different' ? activeRevenueType : 'all'
      const result = await getKPIStructure(selectedUnit, revType)
      if (result.error) throw new Error(result.error)

      // Set all data at once to minimize re-renders
      setCategories(result.categories || [])
      setIndicators(result.indicators || [])
      setSubIndicators(result.subIndicators || [])

    } catch (error: any) {
      console.error('Error loading KPI structure:', error)
      setError(`Gagal memuat struktur KPI: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [selectedUnit, kpiSchemaMode, activeRevenueType])

  const handleSaveKPISchemaMode = async () => {
    if (!selectedUnit) return
    setIsSavingSchemaMode(true)
    try {
      await updateUnitKPISchemaMode(selectedUnit, kpiSchemaMode)
      setSavedKpiSchemaMode(kpiSchemaMode)
      setUnits(prev => prev.map(u => u.id === selectedUnit ? { ...u, kpi_schema_mode: kpiSchemaMode } : u))
      alert('Pengaturan skema KPI berhasil disimpan.')
    } catch (err: any) {
      console.error('Failed to update KPI schema mode:', err)
      alert('Gagal menyimpan pengaturan skema KPI.')
    } finally {
      setIsSavingSchemaMode(false)
    }
  }

  useEffect(() => {
    if (!mounted || userMetadata === null) return

    setError(null)
    loadUnits().catch((err) => {
      console.error('Failed to load units:', err)
      setError('Gagal memuat data unit. Silakan refresh halaman.')
      setIsLoading(false)
    })
  }, [mounted, userMetadata, loadUnits])

  useEffect(() => {
    if (!mounted || !selectedUnit) return

    setError(null)
    loadKPIStructure()
  }, [mounted, selectedUnit, loadKPIStructure])

  const handleAddCategory = useCallback(() => {
    setSelectedCategory(null)
    setIsCategoryDialogOpen(true)
  }, [])

  const handleEditCategory = useCallback((category: KPICategory) => {
    setSelectedCategory(category)
    setIsCategoryDialogOpen(true)
  }, [])

  const handleAddIndicator = useCallback((categoryId: string) => {
    setSelectedCategory(categories.find(c => c.id === categoryId) || null)
    setSelectedIndicator(null)
    setIsIndicatorDialogOpen(true)
  }, [categories])

  const handleEditIndicator = useCallback((indicator: KPIIndicator) => {
    setSelectedIndicator(indicator)
    setIsIndicatorDialogOpen(true)
  }, [])

  const handleAddSubIndicator = useCallback((indicatorId: string) => {
    const ind = indicators.find(i => i.id === indicatorId) || null
    setSelectedIndicatorForSub(ind)
    setSelectedSubIndicator(null)
    setIsSubIndicatorDialogOpen(true)
  }, [indicators])

  const handleEditSubIndicator = useCallback((subIndicator: KPISubIndicator) => {
    // Find parent indicator for context
    const parentIndicator = indicators.find(i => i.id === subIndicator.indicator_id) || null
    setSelectedIndicatorForSub(parentIndicator)
    setSelectedSubIndicator(subIndicator)
    setIsSubIndicatorDialogOpen(true)
  }, [indicators])

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    const categoryIndicators = indicators.filter(i => i.category_id === categoryId)

    if (categoryIndicators.length > 0) {
      if (!confirm('Kategori ini memiliki indikator. Menghapusnya akan menghapus semua indikator dan sub indikator. Lanjutkan?')) {
        return
      }
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('m_kpi_categories')
        .delete()
        .eq('id', categoryId)

      if (error) throw error
      await loadKPIStructure()
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('Gagal menghapus kategori')
    }
  }, [indicators, loadKPIStructure])

  const handleDeleteIndicator = useCallback(async (indicatorId: string) => {
    const supabase = createClient()
    const { data: realizationData, error: realizationError } = await supabase
      .from('t_realization')
      .select('id')
      .eq('indicator_id', indicatorId)
      .limit(1)

    if (realizationError) {
      console.error('Error checking realization data:', realizationError)
      return
    }

    if (realizationData && realizationData.length > 0) {
      if (!confirm('Indikator ini memiliki data realisasi. Penghapusan akan mempengaruhi perhitungan historis. Lanjutkan?')) {
        return
      }
    } else {
      if (!confirm('Hapus indikator ini beserta semua sub indikatornya? Tindakan ini tidak dapat dibatalkan.')) {
        return
      }
    }

    try {
      const { error } = await supabase
        .from('m_kpi_indicators')
        .delete()
        .eq('id', indicatorId)

      if (error) throw error
      await loadKPIStructure()
    } catch (error) {
      console.error('Error deleting indicator:', error)
      alert('Gagal menghapus indikator')
    }
  }, [loadKPIStructure])

  const handleDeleteSubIndicator = useCallback(async (subIndicatorId: string) => {
    const subIndicator = subIndicators.find(s => s.id === subIndicatorId)
    if (!subIndicator) return

    if (!confirm(`Apakah Anda yakin ingin menghapus sub indikator "${subIndicator.code} - ${subIndicator.name}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return

    try {
      const supabase = createClient()

      // Check if sub indicator is being used in realization data
      const { data: realizationData, error: checkError } = await supabase
        .from('t_realization')
        .select('id')
        .eq('sub_indicator_id', subIndicatorId)
        .limit(1)

      if (checkError) throw checkError

      if (realizationData && realizationData.length > 0) {
        alert('Sub indikator ini tidak dapat dihapus karena sudah digunakan dalam data realisasi KPI.')
        return
      }

      const { error } = await supabase
        .from('m_kpi_sub_indicators')
        .delete()
        .eq('id', subIndicatorId)

      if (error) throw error

      await loadKPIStructure()
      alert('Sub indikator berhasil dihapus')
    } catch (error: any) {
      console.error('Error deleting sub indicator:', error)
      alert(error.message || 'Gagal menghapus sub indikator')
    }
  }, [subIndicators, loadKPIStructure])

  const handleCopyStructure = useCallback(() => {
    setIsCopyDialogOpen(true)
  }, [])

  const handleCopyComplete = useCallback(async () => {
    await loadKPIStructure()
    setIsCopyDialogOpen(false)
  }, [loadKPIStructure])

  const handleDownloadGuide = useCallback((revType?: string, format: 'pdf' | 'word' = 'pdf') => {
    const selectedRev = revType || activeRevenueType
    const revenueParam = `revenueType=${selectedRev}`
    const formatParam = `format=${format}`
    const url = selectedUnit
      ? `/api/kpi-config/guide?unitId=${selectedUnit}&${revenueParam}&${formatParam}`
      : `/api/kpi-config/guide?${revenueParam}&${formatParam}`
    window.open(url, '_blank')
  }, [selectedUnit, activeRevenueType])

  if (!mounted || (isLoading && units.length === 0)) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Terjadi Kesalahan</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <Button
            onClick={() => {
              setError(null)
              loadUnits()
            }}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Coba Lagi
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Konfigurasi KPI</h1>
          <p className="text-gray-600 mt-1">Konfigurasi kategori, indikator, dan sub indikator KPI untuk setiap unit</p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg transition-all">
                <Download className="h-4 w-4 mr-2" />
                Petunjuk (PDF / Word)
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
                Format PDF
              </div>
              <DropdownMenuItem onClick={() => handleDownloadGuide('bpjs', 'pdf')} className="cursor-pointer">
                <FileText className="h-4 w-4 mr-2 text-blue-600" />
                Versi BPJS Kesehatan (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownloadGuide('umum', 'pdf')} className="cursor-pointer">
                <FileText className="h-4 w-4 mr-2 text-emerald-600" />
                Versi Pendapatan UMUM (PDF)
              </DropdownMenuItem>
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-y border-gray-100 mt-1">
                Format Word (DOCX)
              </div>
              <DropdownMenuItem onClick={() => handleDownloadGuide('bpjs', 'word')} className="cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-blue-700" />
                Versi BPJS Kesehatan (Word)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownloadGuide('umum', 'word')} className="cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-700" />
                Versi Pendapatan UMUM (Word)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!isReadOnly && (
            <>
              <Button
                onClick={handleCopyStructure}
                className="bg-cyan-500 hover:bg-cyan-600 text-white shadow-md hover:shadow-lg transition-all"
              >
                <Copy className="h-4 w-4 mr-2" />
                Salin Struktur
              </Button>
              <Button
                onClick={handleAddCategory}
                className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg transition-all"
              >
                <Plus className="h-4 w-4 mr-2" />
                Tambah Kategori
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Unit Selector - only visible for superadmin */}
      {isSuperAdmin ? (
        <Card className="border-2 border-blue-100 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Building2 className="h-5 w-5" />
              <span className="text-xl">Pilih Unit</span>
              <span className="text-sm font-normal text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                {units.length} unit
              </span>
            </CardTitle>
            <CardDescription className="text-blue-700">Pilih unit untuk melihat dan mengkonfigurasi struktur KPI</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Select value={selectedUnit || undefined} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-full h-14 text-base font-medium border-2 border-blue-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 bg-white hover:bg-blue-50 hover:border-blue-300 transition-all shadow-sm">
                <SelectValue placeholder="Pilih unit..." />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {units.map(unit => (
                  <SelectItem
                    key={unit.id}
                    value={unit.id}
                    className="text-base py-3 cursor-pointer hover:bg-blue-50 focus:bg-blue-100"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">{unit.code}</span>
                      <span className="text-gray-700">{unit.name}</span>
                      {checkMedicalUnit(unit.id, unit.name) && (
                        <Badge variant="secondary" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 px-1">Medis</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : (
        /* For Unit Manager, show their unit information clearly but without selector */
        selectedUnitData && (
          <Card className="border-l-4 border-blue-600 shadow-md">
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 rounded-full text-blue-600">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedUnitData.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50 font-bold">
                      {selectedUnitData.code}
                    </Badge>
                    {isMedicalUnit && (
                      <Badge className="bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100">
                        Unit Medis
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium text-gray-500">Mode Akses</p>
                <p className="text-base font-bold text-blue-700">Manager Unit</p>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* KPI Schema Mode Toggle & Revenue Tabs */}
      {selectedUnit && (
        <Card className="border border-slate-200 bg-slate-50/50 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Skema Penggunaan KPI per Jenis Pendapatan</h3>
                <p className="text-xs text-slate-500">
                  Tentukan apakah unit ini menggunakan indikator KPI yang sama atau berbeda untuk BPJS Kesehatan vs Pendapatan Umum
                </p>
              </div>

              {!isReadOnly && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
                    <button
                      type="button"
                      onClick={() => setKpiSchemaMode('same')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${kpiSchemaMode === 'same'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      KPI Sama (BPJS &amp; UMUM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setKpiSchemaMode('different')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${kpiSchemaMode === 'different'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      KPI Berbeda per Jenis Pendapatan
                    </button>
                  </div>

                  {kpiSchemaMode !== savedKpiSchemaMode && (
                    <Button
                      type="button"
                      onClick={handleSaveKPISchemaMode}
                      disabled={isSavingSchemaMode}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md animate-pulse"
                    >
                      {isSavingSchemaMode ? 'Menyimpan...' : 'Simpan Skema'}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {kpiSchemaMode === 'different' && (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-in fade-in duration-200">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveRevenueType('bpjs')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${activeRevenueType === 'bpjs'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${activeRevenueType === 'bpjs' ? 'bg-white' : 'bg-blue-600'}`} />
                    KPI BPJS Kesehatan
                  </button>

                  <button
                    onClick={() => setActiveRevenueType('umum')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${activeRevenueType === 'umum'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${activeRevenueType === 'umum' ? 'bg-white' : 'bg-amber-600'}`} />
                    KPI Pendapatan UMUM
                  </button>
                </div>

                {!isReadOnly && activeRevenueType === 'umum' && (
                  <Button
                    onClick={() => setIsCopyBPJSDialogOpen(true)}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs shadow-sm"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Salin KPI dari BPJS Kesehatan
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Tree */}
      {selectedUnit && (
        <Card>
          <CardHeader>
            <CardTitle>
              Struktur KPI {kpiSchemaMode === 'different' ? (activeRevenueType === 'bpjs' ? '- BPJS Kesehatan' : '- Pendapatan UMUM') : ''}
            </CardTitle>
            <CardDescription>
              Kategori (P1, P2, P3) → Indikator → Sub Indikator (dengan nilai skor)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <KPITree
                categories={categories}
                indicators={indicators}
                subIndicators={subIndicators}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
                onAddIndicator={handleAddIndicator}
                onEditIndicator={handleEditIndicator}
                onDeleteIndicator={handleDeleteIndicator}
                onAddSubIndicator={handleAddSubIndicator}
                onEditSubIndicator={handleEditSubIndicator}
                onDeleteSubIndicator={handleDeleteSubIndicator}
                isReadOnly={isReadOnly}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <CategoryFormDialog
        open={isCategoryDialogOpen}
        onOpenChange={setIsCategoryDialogOpen}
        category={selectedCategory}
        unitId={selectedUnit}
        existingCategories={categories}
        onSuccess={loadKPIStructure}
        revenueType={kpiSchemaMode === 'different' ? activeRevenueType : 'bpjs'}
      />

      <IndicatorFormDialog
        open={isIndicatorDialogOpen}
        onOpenChange={setIsIndicatorDialogOpen}
        indicator={selectedIndicator}
        category={selectedCategory}
        existingIndicators={indicators.filter(i => i.category_id === selectedCategory?.id)}
        onSuccess={loadKPIStructure}
        isMedicalUnit={isMedicalUnit}
      />

      <SubIndicatorFormDialog
        open={isSubIndicatorDialogOpen}
        onOpenChange={setIsSubIndicatorDialogOpen}
        subIndicator={selectedSubIndicator}
        indicator={selectedIndicatorForSub}
        existingSubIndicators={subIndicators.filter(s => s.indicator_id === selectedIndicatorForSub?.id)}
        onSuccess={loadKPIStructure}
        isMedicalUnit={isMedicalUnit}
      />

      <CopyStructureDialog
        open={isCopyDialogOpen}
        onOpenChange={setIsCopyDialogOpen}
        units={units}
        sourceUnitId={selectedUnit}
        onSuccess={handleCopyComplete}
      />

      <CopyBPJSStructureDialog
        open={isCopyBPJSDialogOpen}
        onOpenChange={setIsCopyBPJSDialogOpen}
        unitId={selectedUnit}
        unitName={selectedUnitData?.name}
        onSuccess={loadKPIStructure}
      />
    </div>
  )
}
