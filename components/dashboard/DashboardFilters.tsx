'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Calendar, Filter, Download } from 'lucide-react'

interface DashboardFiltersProps {
  onFilterChange?: (filters: FilterState) => void
  showUnitFilter?: boolean
  showPeriodFilter?: boolean
  showExport?: boolean
  units?: Array<{ id: string, name: string }>
  initialPeriod?: string
}

export interface FilterState {
  period: string
  unit?: string
  year: string
}

export function DashboardFilters({
  onFilterChange,
  showUnitFilter = false,
  showPeriodFilter = true,
  showExport = true,
  units = [],
  initialPeriod
}: DashboardFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentYear = new Date().getFullYear()

  const currentUnit = searchParams.get('unit_id') || 'all'
  const currentYearVal = searchParams.get('year') || currentYear.toString()
  const currentPeriod = searchParams.get('period') || initialPeriod || 'M-01'

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || !value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`?${params.toString()}`)
  }

  return (
    <Card className="mb-6 overflow-visible border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-2 text-gray-600">
            <Filter className="h-5 w-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Filter</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-3 md:gap-4 flex-1">
            {showPeriodFilter && (
              <div className="flex items-center gap-3 w-full">
                <Calendar className="h-5 w-5 text-gray-400 hidden sm:block" />
                <select
                  value={currentPeriod}
                  onChange={(e) => handleFilterChange('period', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-300"
                >
                  <optgroup label="Bulan">
                    <option value="M-01">Januari</option>
                    <option value="M-02">Februari</option>
                    <option value="M-03">Maret</option>
                    <option value="M-04">April</option>
                    <option value="M-05">Mei</option>
                    <option value="M-06">Juni</option>
                    <option value="M-07">Juli</option>
                    <option value="M-08">Agustus</option>
                    <option value="M-09">September</option>
                    <option value="M-10">Oktober</option>
                    <option value="M-11">November</option>
                    <option value="M-12">Desember</option>
                  </optgroup>
                  <optgroup label="Kuartal">
                    <option value="Q-1">Kuartal 1</option>
                    <option value="Q-2">Kuartal 2</option>
                    <option value="Q-3">Kuartal 3</option>
                    <option value="Q-4">Kuartal 4</option>
                  </optgroup>
                  <optgroup label="Semester">
                    <option value="S-1">Semester 1</option>
                    <option value="S-2">Semester 2</option>
                  </optgroup>
                  <optgroup label="Lainnya">
                    <option value="full-year">Akhir Tahun</option>
                    <option value="month">Bulan Ini</option>
                  </optgroup>
                </select>
              </div>
            )}

            <div className="w-full sm:w-auto">
              <select
                value={currentYearVal}
                onChange={(e) => handleFilterChange('year', e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-300"
              >
                {Array.from({ length: 5 }, (_, i) => currentYear - i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {showUnitFilter && (
              <div className="w-full lg:min-w-[220px]">
                <select
                  value={currentUnit}
                  onChange={(e) => handleFilterChange('unit_id', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-300"
                >
                  <option value="all">Semua Unit</option>
                  {units.map(unit => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
            )}

            {showExport && (
              <div className="sm:col-span-2 lg:ml-auto">
                <Button
                  onClick={async () => {
                    try {
                      const period = searchParams.get('period') || 'month'
                      const year = searchParams.get('year') || new Date().getFullYear().toString()
                      const unitId = searchParams.get('unit_id')

                      const response = await fetch('/api/dashboard/export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ period, year, unitId })
                      })

                      if (!response.ok) throw new Error('Gagal mengunduh laporan')

                      const blob = await response.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `Dashboard_Report_${period}_${year}.pdf`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                    } catch (err) {
                      console.error('Export error:', err)
                      alert('Gagal mengunduh laporan dashboard')
                    }
                  }}
                  className="w-full sm:w-auto font-bold bg-red-600 hover:bg-red-700 text-white transition-all h-10 px-5 shadow-sm"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Unduh
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
