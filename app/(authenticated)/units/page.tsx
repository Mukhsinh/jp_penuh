'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  RefreshCw,
  PieChart,
  Building2,
  Users,
  Calendar,
  Lock,
  Unlock,
  Sparkles,
  Loader2
} from 'lucide-react'
import { UnitTable } from '@/components/units/UnitTable'
import { CreateUnitPeriodDialog } from '@/components/units/CreateUnitPeriodDialog'
import {
  getUnitPeriodsAction,
  getUnitsByPeriodAction,
  lockUnitPeriodAction,
  unlockUnitPeriodAction
} from './actions'
import { formatPeriodToMonthName } from '@/lib/utils/format'
import type { UnitPeriod } from '@/lib/types/database.types'
import { toast } from 'sonner'

// Debounce hook for search optimization
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export default function UnitsPage() {
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Period management state
  const [periods, setPeriods] = useState<UnitPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-01')
  const [periodInfo, setPeriodInfo] = useState<{
    period: string
    is_locked: boolean
    period_name: string
    locked_at?: string | null
    locked_by?: string | null
  }>({
    period: '2026-01',
    is_locked: false,
    period_name: 'Januari 2026'
  })

  const [showCreatePeriodDialog, setShowCreatePeriodDialog] = useState(false)
  const [lockingPeriod, setLockingPeriod] = useState(false)

  // Debounce search term to reduce API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 400)

  // Load available periods
  const loadPeriods = useCallback(async () => {
    try {
      const res = await getUnitPeriodsAction()
      if (res.data && res.data.length > 0) {
        setPeriods(res.data)
        if (!res.data.some(p => p.period === selectedPeriod)) {
          setSelectedPeriod(res.data[0].period)
        }
      }
    } catch (err) {
      console.error('Failed to load unit periods:', err)
    }
  }, [selectedPeriod])

  useEffect(() => {
    loadPeriods()
  }, [loadPeriods])

  // Load units for the selected period
  const loadUnits = useCallback(async () => {
    if (!selectedPeriod) return
    setLoading(true)
    try {
      const result = await getUnitsByPeriodAction(selectedPeriod)

      if (result.error) {
        console.error('Error loading units:', result.error)
        toast.error(result.error)
      } else {
        setUnits(result.data || [])
        if (result.periodInfo) {
          setPeriodInfo(result.periodInfo)
        }
      }
    } catch (error) {
      console.error('Error loading units:', error)
      toast.error('Gagal memuat data unit')
    }
    setLoading(false)
  }, [selectedPeriod])

  useEffect(() => {
    loadUnits()
  }, [loadUnits])

  // Lock period handler
  const handleLockPeriod = async () => {
    if (!confirm(`Kunci proporsi unit untuk periode ${periodInfo.period_name || selectedPeriod}?\n\nSetelah dikunci, besaran persentase porsi unit untuk periode ini tidak dapat diubah lagi, dan perubahan pada periode berikutnya tidak akan mempengaruhi kalkulasi pada periode ini.`)) {
      return
    }

    setLockingPeriod(true)
    try {
      const res = await lockUnitPeriodAction(selectedPeriod)
      if (res.success) {
        toast.success(`Periode ${periodInfo.period_name || selectedPeriod} berhasil dikunci!`)
        await loadPeriods()
        await loadUnits()
      } else {
        toast.error(res.error || 'Gagal mengunci periode')
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan sistem')
    } finally {
      setLockingPeriod(false)
    }
  }

  // Unlock period handler
  const handleUnlockPeriod = async () => {
    if (!confirm(`Buka kunci periode ${periodInfo.period_name || selectedPeriod}?\n\nPeringatan: Membuka kunci memungkinkan pengeditan proporsi unit pada periode ini.`)) {
      return
    }

    setLockingPeriod(true)
    try {
      const res = await unlockUnitPeriodAction(selectedPeriod)
      if (res.success) {
        toast.success(`Kunci periode ${periodInfo.period_name || selectedPeriod} berhasil dibuka!`)
        await loadPeriods()
        await loadUnits()
      } else {
        toast.error(res.error || 'Gagal membuka kunci periode')
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan sistem')
    } finally {
      setLockingPeriod(false)
    }
  }

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value)
  }, [])

  // Filter units based on search term
  const filteredUnits = useMemo(() => {
    return units.filter(unit => {
      if (!debouncedSearchTerm) return true
      const searchLower = debouncedSearchTerm.toLowerCase()
      return (
        unit.code?.toLowerCase().includes(searchLower) ||
        unit.name?.toLowerCase().includes(searchLower)
      )
    })
  }, [units, debouncedSearchTerm])

  // Calculate total BPJS proportion from all units
  const totalProportionBPJS = useMemo(() => {
    return units.reduce((sum, unit) => {
      return sum + (parseFloat(unit.proportion_percentage) || 0)
    }, 0)
  }, [units])

  // Calculate total UMUM proportion from all units
  const totalProportionUMUM = useMemo(() => {
    return units.reduce((sum, unit) => {
      const prop = unit.use_same_proportion !== false
        ? (parseFloat(unit.proportion_percentage) || 0)
        : (parseFloat(unit.proportion_umum_percentage ?? unit.proportion_percentage) || 0)
      return sum + prop
    }, 0)
  }, [units])

  // Calculate total employees across all units for this period
  const totalEmployees = useMemo(() => {
    return units
      .filter(u => u.name?.toUpperCase() !== 'SUPERADMIN')
      .reduce((sum, unit) => {
        const empCount = unit.employee_count !== undefined
          ? unit.employee_count
          : (unit.employees?.[0]?.count || 0)
        return sum + empCount
      }, 0)
  }, [units])

  const isCurrentPeriodLocked = periodInfo?.is_locked ?? false

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Manajemen Unit Kerja</h1>
          <p className="text-sm text-gray-500 font-medium">Penetapan besaran porsi persentase per unit kerja dan penguncian per periode</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadUnits} disabled={loading} className="h-9">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </Button>
        </div>
      </div>

      {/* PERIOD SELECTION & LOCKING CONTROL CARD */}
      <Card className="border-2 border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-blue-50/50 to-white shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Period Selector & Status */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-indigo-600 text-white rounded-lg shadow-sm">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Periode Proporsi Unit</span>
                  <div className="w-56 sm:w-64 mt-0.5">
                    <Select
                      value={selectedPeriod}
                      onValueChange={(val) => {
                        setSelectedPeriod(val)
                      }}
                    >
                      <SelectTrigger className="bg-white border-indigo-200 font-semibold text-slate-800 shadow-sm h-10">
                        <SelectValue placeholder="Pilih Periode" />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.period} value={p.period}>
                            <span className="font-semibold">{p.period_name || formatPeriodToMonthName(p.period)}</span>
                            {p.is_locked ? ' 🔒 (Terkunci)' : ' 🔓 (Draf)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 pt-2 sm:pt-4">
                {isCurrentPeriodLocked ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs">
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    Porsi Ditetapkan &amp; Dikunci
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 shadow-xs">
                    <Unlock className="w-3.5 h-3.5 text-amber-600" />
                    Draf / Terbuka (Dapat Diedit)
                  </span>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {isCurrentPeriodLocked ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnlockPeriod}
                  disabled={lockingPeriod}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 h-9 font-medium"
                >
                  {lockingPeriod ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Unlock className="w-4 h-4 mr-1.5 text-amber-600" />}
                  Buka Kunci Periode
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLockPeriod}
                  disabled={lockingPeriod}
                  className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 h-9 font-semibold"
                >
                  {lockingPeriod ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Lock className="w-4 h-4 mr-1.5 text-emerald-600" />}
                  Kunci Periode Ini
                </Button>
              )}

              <Button
                size="sm"
                onClick={() => setShowCreatePeriodDialog(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 font-medium shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-indigo-200" />
                Buka Periode Baru
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-all duration-300 border border-gray-100 bg-gradient-to-br from-white to-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold text-gray-700 uppercase tracking-wide">Total Unit Kerja</CardTitle>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-gray-900">{units.length}</div>
            <p className="text-xs text-gray-500 font-medium mt-0.5">unit terdaftar aktif</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all duration-300 border border-gray-100 bg-gradient-to-br from-white to-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold text-gray-700 uppercase tracking-wide">Total Pegawai</CardTitle>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-gray-900">{totalEmployees}</div>
            <p className="text-xs text-gray-500 font-medium mt-0.5">di {periodInfo.period_name || selectedPeriod}</p>
          </CardContent>
        </Card>

        <Card className={`hover:shadow-md transition-all duration-300 border ${Math.abs(totalProportionBPJS - 100) < 0.01 ? 'border-green-200 bg-gradient-to-br from-white to-green-50/30' : 'border-amber-200 bg-gradient-to-br from-white to-amber-50/30'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold text-gray-700 uppercase tracking-wide">Proporsi BPJS</CardTitle>
            <div className={`p-2 rounded-lg ${Math.abs(totalProportionBPJS - 100) < 0.01 ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
              <PieChart className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black ${Math.abs(totalProportionBPJS - 100) < 0.01 ? 'text-green-700' : 'text-amber-700'}`}>
              {totalProportionBPJS.toFixed(2)}%
            </div>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {Math.abs(totalProportionBPJS - 100) < 0.01 ? '✓ Seimbang 100%' : 'Alokasi klaim BPJS'}
            </p>
          </CardContent>
        </Card>

        <Card className={`hover:shadow-md transition-all duration-300 border ${Math.abs(totalProportionUMUM - 100) < 0.01 ? 'border-green-200 bg-gradient-to-br from-white to-green-50/30' : 'border-amber-200 bg-gradient-to-br from-white to-amber-50/30'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold text-gray-700 uppercase tracking-wide">Proporsi UMUM</CardTitle>
            <div className={`p-2 rounded-lg ${Math.abs(totalProportionUMUM - 100) < 0.01 ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
              <PieChart className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black ${Math.abs(totalProportionUMUM - 100) < 0.01 ? 'text-green-700' : 'text-amber-700'}`}>
              {totalProportionUMUM.toFixed(2)}%
            </div>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {Math.abs(totalProportionUMUM - 100) < 0.01 ? '✓ Seimbang 100%' : 'Alokasi pasien umum'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Units Table Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle>Daftar Unit Kerja - Periode {periodInfo.period_name || selectedPeriod}</CardTitle>
              <CardDescription>
                Menampilkan {filteredUnits.length} dari {units.length} unit terdaftar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Cari berdasarkan kode atau nama unit..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <UnitTable
            units={filteredUnits}
            onSuccess={loadUnits}
            period={selectedPeriod}
            isLocked={isCurrentPeriodLocked}
            periodName={periodInfo.period_name}
          />
        </CardContent>
      </Card>

      {/* Create Period Dialog */}
      <CreateUnitPeriodDialog
        open={showCreatePeriodDialog}
        onClose={() => setShowCreatePeriodDialog(false)}
        onSuccess={(newP) => {
          setSelectedPeriod(newP)
          loadPeriods()
        }}
        existingPeriods={periods}
      />
    </div>
  )
}
