'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Download, TrendingUp, Users, Target, Award } from 'lucide-react'

interface AssessmentReport {
  period: string
  unit_id?: string
  unit_name?: string
  total_employees: number
  assessed_employees: number
  completion_rate: number
  average_score: number
  category_breakdown: {
    p1_average: number
    p2_average: number
    p3_average: number
  }
  status_distribution: {
    completed: number
    partial: number
    not_started: number
  }
  top_performers: Array<{
    employee_name: string
    total_score: number
    unit_name: string
  }>
  improvement_areas: Array<{
    indicator_name: string
    average_achievement: number
    category: string
  }>
}

interface PeriodComparison {
  current_period: string
  previous_period: string
  completion_rate_change: number
  average_score_change: number
  trend: 'up' | 'down' | 'stable'
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export default function AssessmentReports({
  availablePeriods: propAvailablePeriods,
  selectedPeriod: propSelectedPeriod,
  currentEmployee
}: {
  availablePeriods: string[],
  selectedPeriod?: string,
  currentEmployee?: {
    id: string
    role: string
    unit_id: string
    full_name: string
  }
}) {
  const isUnitManager = currentEmployee?.role === 'unit_manager' && currentEmployee.unit_id && currentEmployee.unit_id !== 'all'
  const [selectedPeriod, setSelectedPeriod] = useState<string>(propSelectedPeriod || '')
  const [selectedUnit, setSelectedUnit] = useState<string>(isUnitManager ? currentEmployee.unit_id : 'all')
  const [reportData, setReportData] = useState<AssessmentReport | null>(null)
  const [periodComparison, setPeriodComparison] = useState<PeriodComparison | null>(null)
  const [periods, setPeriods] = useState<string[]>(propAvailablePeriods || [])
  const [availableUnits, setAvailableUnits] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)

  // Sync selected period from props if it changes
  useEffect(() => {
    if (propSelectedPeriod && propSelectedPeriod !== selectedPeriod) {
      setSelectedPeriod(propSelectedPeriod)
    }
  }, [propSelectedPeriod])

  useEffect(() => {
    if (propAvailablePeriods && propAvailablePeriods.length > 0) {
      setPeriods(propAvailablePeriods)
      if (!selectedPeriod && !propSelectedPeriod && propAvailablePeriods.length > 0) {
        setSelectedPeriod(propAvailablePeriods[0])
      }
    } else {
      fetchAvailablePeriods()
    }
    fetchAvailableUnits()
  }, [propAvailablePeriods])

  useEffect(() => {
    if (selectedPeriod) {
      fetchReportData()
      fetchPeriodComparison()
    }
  }, [selectedPeriod, selectedUnit])

  const fetchAvailablePeriods = async () => {
    try {
      const response = await fetch('/api/assessment/reports?action=periods')
      const data = await response.json()
      if (data.success) {
        setPeriods(data.periods)
        if (data.periods.length > 0) {
          setSelectedPeriod(data.periods[0])
        }
      }
    } catch (error) {
      console.error('Error fetching periods:', error)
    }
  }

  const fetchAvailableUnits = async () => {
    try {
      const response = await fetch('/api/assessment/reports?action=units')
      const data = await response.json()
      if (data.success) {
        setAvailableUnits(data.units)
      }
    } catch (error) {
      console.error('Error fetching units:', error)
    }
  }

  const fetchReportData = async () => {
    if (!selectedPeriod) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        action: 'report',
        period: selectedPeriod,
        ...(selectedUnit !== 'all' && { unit_id: selectedUnit })
      })

      const response = await fetch(`/api/assessment/reports?${params}`)
      const data = await response.json()

      if (data.success) {
        setReportData(data.report)
      }
    } catch (error) {
      console.error('Error fetching report data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPeriodComparison = async () => {
    if (!selectedPeriod) return

    try {
      const params = new URLSearchParams({
        action: 'comparison',
        period: selectedPeriod,
        ...(selectedUnit !== 'all' && { unit_id: selectedUnit })
      })

      const response = await fetch(`/api/assessment/reports?${params}`)
      const data = await response.json()

      if (data.success) {
        setPeriodComparison(data.comparison)
      }
    } catch (error) {
      console.error('Error fetching period comparison:', error)
    }
  }

  const handleDownloadGuide = async () => {
    try {
      const params = new URLSearchParams({
        ...(selectedUnit !== 'all' && { unit_id: selectedUnit })
      })

      const response = await fetch(`/api/reports/assessment-guide?${params}`)
      const blob = await response.blob()

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `petunjuk-penilaian-${selectedUnit !== 'all' ? selectedUnit : 'umum'}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading guide:', error)
    }
  }

  const handleExportReport = async () => {
    if (!selectedPeriod) return

    try {
      const params = new URLSearchParams({
        period: selectedPeriod,
        ...(selectedUnit !== 'all' && { unit_id: selectedUnit })
      })

      const response = await fetch(`/api/assessment/export?${params}`)
      const blob = await response.blob()

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `laporan-penilaian-${selectedPeriod}${selectedUnit !== 'all' ? `-${selectedUnit}` : ''}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error exporting report:', error)
    }
  }

  const categoryData = reportData ? [
    { name: 'P1 (Posisi)', value: reportData.category_breakdown.p1_average, color: '#0088FE' },
    { name: 'P2 (Kinerja)', value: reportData.category_breakdown.p2_average, color: '#00C49F' },
    { name: 'P3 (Potensi)', value: reportData.category_breakdown.p3_average, color: '#FFBB28' },
  ] : []

  const statusData = reportData ? [
    { name: 'Selesai', value: reportData.status_distribution.completed, color: '#00C49F' },
    { name: 'Sebagian', value: reportData.status_distribution.partial, color: '#FFBB28' },
    { name: 'Belum Mulai', value: reportData.status_distribution.not_started, color: '#FF8042' },
  ] : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Memuat laporan...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Laporan Penilaian KPI</h2>
          <p className="text-gray-600">Analisis dan ringkasan penilaian kinerja pegawai</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadGuide}>
            <Download className="h-4 w-4 mr-2" />
            Unduh Petunjuk
          </Button>
          <Button onClick={handleExportReport} disabled={!reportData}>
            <Download className="h-4 w-4 mr-2" />
            Ekspor Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih periode" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period} value={period}>
                  {period}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          {isUnitManager ? (
            <div className="h-10 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-md border text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center">
              <span>Unit: <strong>{availableUnits.find(u => u.id === currentEmployee?.unit_id)?.name || 'Unit Anda'}</strong></span>
            </div>
          ) : (
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Unit</SelectItem>
                {availableUnits.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {reportData && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pegawai</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.total_employees}</div>
                <p className="text-xs text-muted-foreground">
                  {reportData.assessed_employees} sudah dinilai
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tingkat Penyelesaian</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.completion_rate.toFixed(1)}%</div>
                {periodComparison && (
                  <p className={`text-xs flex items-center ${periodComparison.completion_rate_change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {periodComparison.completion_rate_change >= 0 ? '+' : ''}
                    {periodComparison.completion_rate_change.toFixed(1)}% dari periode sebelumnya
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rata-rata Skor</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.average_score.toFixed(1)}</div>
                {periodComparison && (
                  <p className={`text-xs flex items-center ${periodComparison.average_score_change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {periodComparison.average_score_change >= 0 ? '+' : ''}
                    {periodComparison.average_score_change.toFixed(1)} dari periode sebelumnya
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status Penilaian</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Selesai</span>
                    <span className="font-medium">{reportData.status_distribution.completed}</span>
                  </div>
                  <Progress
                    value={(reportData.status_distribution.completed / reportData.total_employees) * 100}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <Tabs defaultValue="category" className="space-y-4">
            <TabsList>
              <TabsTrigger value="category">Breakdown Kategori</TabsTrigger>
              <TabsTrigger value="status">Distribusi Status</TabsTrigger>
              <TabsTrigger value="performance">Performa Unit</TabsTrigger>
            </TabsList>

            <TabsContent value="category" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Rata-rata Skor per Kategori KPI</CardTitle>
                  <CardDescription>
                    Perbandingan performa antara P1 (Posisi), P2 (Kinerja), dan P3 (Potensi)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}`, 'Skor']} />
                      <Bar dataKey="value" fill="#0088FE" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="status" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Distribusi Status Penilaian</CardTitle>
                  <CardDescription>
                    Proporsi pegawai berdasarkan status penyelesaian penilaian
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Performers</CardTitle>
                    <CardDescription>Pegawai dengan skor tertinggi</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reportData.top_performers.slice(0, 5).map((performer, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{performer.employee_name}</p>
                            <p className="text-sm text-gray-600">{performer.unit_name}</p>
                          </div>
                          <Badge variant="secondary">
                            {performer.total_score.toFixed(1)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Area Perbaikan</CardTitle>
                    <CardDescription>Indikator dengan pencapaian terendah</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reportData.improvement_areas.slice(0, 5).map((area, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-sm">{area.indicator_name}</p>
                              <p className="text-xs text-gray-600">{area.category}</p>
                            </div>
                            <span className="text-sm font-medium">
                              {area.average_achievement.toFixed(1)}%
                            </span>
                          </div>
                          <Progress value={area.average_achievement} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}