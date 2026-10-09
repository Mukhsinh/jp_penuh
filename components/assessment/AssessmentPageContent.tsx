'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Search, Filter, RefreshCw, BarChart3, AlertCircle, Copy, Loader2 } from 'lucide-react'
import AssessmentTable from './AssessmentTable'
import AssessmentReports from './AssessmentReports'
import AddAssessmentPeriodDialog from './AddAssessmentPeriodDialog'
import type { AssessmentStatus } from '@/lib/types/assessment.types'

interface AssessmentPageContentProps {
  currentEmployee: {
    id: string
    role: string
    unit_id: string
    full_name: string
  }
  availablePeriods: string[]
}

export default function AssessmentPageContent({
  currentEmployee,
  availablePeriods: availablePeriodsProp
}: AssessmentPageContentProps) {
  const [activeRevenueType, setActiveRevenueType] = useState<'bpjs' | 'umum'>('bpjs')
  const [availablePeriods, setAvailablePeriods] = useState<string[]>(availablePeriodsProp || [])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [employees, setEmployees] = useState<AssessmentStatus[]>([])
  const [filteredEmployees, setFilteredEmployees] = useState<AssessmentStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [availableUnits, setAvailableUnits] = useState<{ id: string, name: string }[]>([])
  const [unitFilter, setUnitFilter] = useState<string>(
    currentEmployee.role === 'unit_manager' ? currentEmployee.unit_id : 'all'
  )
  const [isAddPeriodDialogOpen, setIsAddPeriodDialogOpen] = useState(false)
  const [summary, setSummary] = useState({
    total_employees: 0,
    completed: 0,
    started: 0,
    partial: 0,
    not_started: 0,
    completion_rate: 0
  })
  const [copyingUnit, setCopyingUnit] = useState(false)

  // Load periods and units sequentially to avoid rate limits
  const loadInitialData = async () => {
    try {
      // Load periods first
      const periodsRes = await fetch('/api/assessment/reports?action=periods')
      if (periodsRes.ok) {
        const periodsData = await periodsRes.json()
        if (periodsData.success && periodsData.periods) {
          setAvailablePeriods(periodsData.periods)
        }
      }

      // Then load units (sequential to avoid auth rate limit)
      const unitsRes = await fetch('/api/assessment/reports?action=units')
      if (unitsRes.ok) {
        const unitsData = await unitsRes.json()
        if (unitsData.success && unitsData.units) {
          setAvailableUnits(unitsData.units)
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error)
    }
  }

  // Load employees for assessment
  const loadEmployees = async (retryCount = 0) => {
    if (!selectedPeriod) return

    setLoading(true)
    setError(null)

    try {
      const unitParam = unitFilter !== 'all' ? `&unit_id=${unitFilter}` : ''
      const response = await fetch(`/api/assessment/employees?period=${selectedPeriod}${unitParam}&revenue_type=${activeRevenueType}`)
      if (response.ok) {
        const data = await response.json()
        setEmployees(data.employees || [])
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Gagal memuat data' }))

        // Handle temporary 401 race condition with a silent retry
        if (response.status === 401 && retryCount < 2) {
          console.warn(`[loadEmployees] 401 received, retrying (${retryCount + 1}/2)...`)
          await new Promise(res => setTimeout(res, 500))
          return loadEmployees(retryCount + 1)
        }

        setError(errorData.error || 'Gagal memuat data pegawai')
        setEmployees([])
      }
    } catch (error) {
      console.error('Error loading employees:', error)
      if (retryCount < 2) {
        await new Promise(res => setTimeout(res, 500))
        return loadEmployees(retryCount + 1)
      }
      setError('Terjadi kesalahan saat memuat data')
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }

  // Load assessment status summary
  const loadSummary = async (retryCount = 0) => {
    if (!selectedPeriod) return

    try {
      const unitParam = unitFilter !== 'all' ? `&unit_id=${unitFilter}` : ''
      const response = await fetch(`/api/assessment/status?period=${selectedPeriod}${unitParam}&revenue_type=${activeRevenueType}`)
      if (response.ok) {
        const data = await response.json()
        setSummary(data.summary || {
          total_employees: 0,
          completed: 0,
          started: 0,
          partial: 0,
          not_started: 0,
          completion_rate: 0
        })
      } else if (response.status === 401 && retryCount < 3) {
        await new Promise(res => setTimeout(res, 600))
        return loadSummary(retryCount + 1)
      }
    } catch (error) {
      console.error('Error loading summary:', error)
    }
  }

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Filter employees based on search and status
  useEffect(() => {
    let filtered = employees

    // Apply search filter
    if (debouncedSearchTerm) {
      const lowerSearch = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter(emp =>
        emp.full_name.toLowerCase().includes(lowerSearch) ||
        emp.unit_name.toLowerCase().includes(lowerSearch)
      )
    }

    // Apply unit filter (additional safety for unit managers)
    if (unitFilter && unitFilter !== 'all') {
      filtered = filtered.filter(emp => emp.unit_id === unitFilter)
    }

    // Apply status filter
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(emp => emp.status === statusFilter)
    }

    setFilteredEmployees(filtered)
  }, [employees, debouncedSearchTerm, statusFilter, unitFilter])

  // Load all initial data
  useEffect(() => {
    loadInitialData()
  }, [])

  // Load data when period or unit filter changes - stagger calls to avoid auth rate limit
  useEffect(() => {
    if (selectedPeriod && selectedPeriod !== 'null' && selectedPeriod !== 'undefined') {
      const loadData = async () => {
        await loadEmployees()
        // Small delay to avoid concurrent auth.getUser() calls hitting rate limit
        await loadSummary()
      }
      loadData()
    } else {
      setLoading(false)
    }
  }, [selectedPeriod, unitFilter, activeRevenueType])

  // Handle refresh
  const handleRefresh = () => {
    loadEmployees()
    loadSummary()
  }

  // Handle assessment completion (callback from table)
  const handleAssessmentComplete = () => {
    loadEmployees()
    loadSummary()
  }

  const handleBulkCopy = async () => {
    if (!selectedPeriod) return

    // 1. Identify unit_id
    let unitId = ''
    let unitName = ''

    if (currentEmployee.role === 'unit_manager') {
      unitId = currentEmployee.unit_id
      unitName = 'unit Anda'
    } else {
      // For superadmin, check if the current view is focused on one unit
      const uniqueUnits = Array.from(new Set(filteredEmployees.map(e => JSON.stringify({ id: e.unit_id, name: e.unit_name }))))
      if (uniqueUnits.length === 0) {
        alert('Tidak ada pegawai untuk disalin.')
        return
      }
      if (uniqueUnits.length !== 1) {
        alert('Mohon filter pencarian berdasarkan unit spesifik terlebih dahulu agar sistem dapat melakukan penyalinan massal untuk unit tersebut.')
        return
      }
      const unitData = JSON.parse(uniqueUnits[0])
      unitId = unitData.id
      unitName = unitData.name
    }

    // 2. Identify previous period (assuming descending sort)
    const currentIndex = availablePeriods.indexOf(selectedPeriod)
    if (currentIndex === -1 || currentIndex === availablePeriods.length - 1) {
      alert('Tidak ditemukan periode sebelumnya (prioritas periode di bawah pilihan saat ini) untuk disalin.')
      return
    }
    const previousPeriod = availablePeriods[currentIndex + 1]

    if (!confirm(`Konfirmasi: Salin penilaian SELURUH pegawai di ${unitName} dari periode ${previousPeriod} ke periode ${selectedPeriod}?\n\nPeringatan: Data penilaian yang sudah ada di periode ${selectedPeriod} untuk pegawai tersebut akan diperbarui/ditimpa.`)) {
      return
    }

    setCopyingUnit(true)
    try {
      const response = await fetch('/api/assessment/bulk-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: unitId,
          current_period: selectedPeriod,
          previous_period: previousPeriod
        })
      })

      const data = await response.json()
      if (response.ok) {
        alert(data.message || 'Penyalinan massal berhasil!')
        handleRefresh()
      } else {
        alert('Gagal: ' + (data.error || 'Terjadi kesalahan'))
      }
    } catch (error) {
      console.error('Bulk copy error:', error)
      alert('Terjadi kesalahan sistem saat melakukan penyalinan massal.')
    } finally {
      setCopyingUnit(false)
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Terjadi Kesalahan</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Coba Lagi
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Revenue Stream Switcher */}
      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl flex gap-2 border shadow-sm max-w-md">
        <button
          onClick={() => setActiveRevenueType('bpjs')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeRevenueType === 'bpjs'
            ? 'bg-blue-600 text-white shadow-md'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-200/60'
            }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          BPJS Kesehatan
        </button>
        <button
          onClick={() => setActiveRevenueType('umum')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeRevenueType === 'umum'
            ? 'bg-amber-600 text-white shadow-md'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-200/60'
            }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300 animate-pulse" />
          Pendapatan UMUM
        </button>
      </div>

      {/* Period Selection and Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Periode Penilaian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih periode" />
                </SelectTrigger>
                <SelectContent>
                  {availablePeriods.map(period => (
                    <SelectItem key={period} value={period}>
                      {period}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setIsAddPeriodDialogOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Tambah Periode
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Pegawai</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_employees}</div>
            <p className="text-xs text-muted-foreground">Pegawai aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Selesai Dinilai</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {summary.completed} <span className="text-sm text-muted-foreground font-normal">dari {summary.total_employees}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.started} orang telah mulai dinilai
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tingkat Penyelesaian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{summary.completion_rate}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${summary.completion_rate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content with Tabs */}
      <Tabs defaultValue="assessment" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assessment">Penilaian</TabsTrigger>
          <TabsTrigger value="reports">
            <BarChart3 className="h-4 w-4 mr-2" />
            Laporan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assessment">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Daftar Pegawai</CardTitle>
                  <CardDescription>
                    Kelola penilaian KPI untuk pegawai di periode {selectedPeriod}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleBulkCopy}
                    variant="outline"
                    size="sm"
                    disabled={loading || copyingUnit}
                    className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                  >
                    {copyingUnit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
                    Salin Penilaian Unit
                  </Button>
                  <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading || copyingUnit}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Cari nama pegawai atau unit..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Unit Filter - Only for Superadmin */}
                  {currentEmployee.role === 'superadmin' && (
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-400" />
                      <Select value={unitFilter} onValueChange={setUnitFilter}>
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Pilih Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Unit</SelectItem>
                          {availableUnits.map(unit => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Status</SelectItem>
                        <SelectItem value="Belum Dinilai">Belum Dinilai</SelectItem>
                        <SelectItem value="Sebagian">Sebagian</SelectItem>
                        <SelectItem value="Selesai">Selesai</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Status Legend */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="destructive" className="text-xs">
                  Belum Dinilai
                </Badge>
                <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                  Sebagian
                </Badge>
                <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                  Selesai
                </Badge>
              </div>

              {/* Employee Table */}
              {!selectedPeriod ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-blue-200 rounded-[1.5rem] bg-blue-50/40 my-4">
                  <div className="bg-blue-100 p-4 rounded-full mb-4 shadow-sm">
                    <AlertCircle className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Periode Penilaian Belum Dipilih
                  </h3>
                  <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed mb-4">
                    Penilaian KPI hanya dapat dilakukan setelah Anda memilih periode penilaian. Silakan pilih periode yang tersedia pada dropdown <strong>Periode Penilaian</strong> di atas.
                  </p>
                  <p className="text-xs text-slate-500 italic">
                    * Catatan: Pilihan periode hanya menampilkan periode yang sudah terinput pool pendapatannya.
                  </p>
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                  <Loader2 className="h-8 w-8 animate-spin mb-4 text-blue-600" />
                  <p>Memuat data pegawai...</p>
                </div>
              ) : filteredEmployees.length > 0 ? (
                <AssessmentTable
                  employees={filteredEmployees}
                  period={selectedPeriod}
                  revenueType={activeRevenueType}
                  loading={loading}
                  onAssessmentComplete={handleAssessmentComplete}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-gray-200 rounded-lg">
                  <div className="bg-yellow-50 p-3 rounded-full mb-4">
                    <AlertCircle className="h-8 w-8 text-yellow-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm || unitFilter !== 'all' || statusFilter !== 'all'
                      ? 'Tidak ada pegawai yang sesuai dengan filter'
                      : `Tidak ada data untuk periode ${selectedPeriod}`}
                  </h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
                    {searchTerm || unitFilter !== 'all' || statusFilter !== 'all'
                      ? 'Coba ubah kata kunci pencarian atau reset filter untuk melihat data lainnya.'
                      : `Daftar pegawai tidak muncul? Pastikan periode ${selectedPeriod} sudah dikonfigurasi di menu Pengaturan Pool dan karyawan sudah terdaftar di unit yang dipilih.`}
                  </p>
                  {(searchTerm || unitFilter !== 'all' || statusFilter !== 'all') && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchTerm('');
                        setUnitFilter(currentEmployee.role === 'unit_manager' ? currentEmployee.unit_id : 'all');
                        setStatusFilter('all');
                      }}
                    >
                      Reset Filter
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <AssessmentReports
            availablePeriods={availablePeriods}
            selectedPeriod={selectedPeriod}
          />
        </TabsContent>
      </Tabs>

      <AddAssessmentPeriodDialog
        isOpen={isAddPeriodDialogOpen}
        onClose={() => setIsAddPeriodDialogOpen(false)}
        onSelect={(period) => {
          if (!availablePeriods.includes(period)) {
            const newList = [period, ...availablePeriods].sort((a, b) => b.localeCompare(a))
            setAvailablePeriods(newList)
          }
          setSelectedPeriod(period)
        }}
        existingPeriods={availablePeriods}
      />
    </div>
  )
}