'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  FileText, Download, TrendingUp, Building2, IdCard,
  FileSpreadsheet, FileDown, BarChart2, ClipboardCheck, ChevronDown,
  Users, Search, Filter, Loader2, CheckCircle2, AlertCircle
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { formatNumber, formatCurrency } from '@/lib/utils/format'

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────
type ReportType = 'incentive' | 'kpi-achievement' | 'unit-comparison' | 'employee-slip'

const REPORT_TYPES = [
  {
    id: 'incentive' as ReportType,
    title: 'Laporan Insentif',
    description: 'Distribusi insentif detail dengan skor P1, P2, P3',
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    id: 'kpi-achievement' as ReportType,
    title: 'Laporan Pencapaian KPI',
    description: 'Realisasi KPI dan persentase pencapaian',
    icon: TrendingUp,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    id: 'unit-comparison' as ReportType,
    title: 'Laporan Perbandingan Unit',
    description: 'Bandingkan kinerja antar unit',
    icon: Building2,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    id: 'employee-slip' as ReportType,
    title: 'Slip Pegawai',
    description: 'Slip insentif pegawai individual',
    icon: IdCard,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
]

// ────────────────────────────────────────────────────────────────
// Sub-components
// Sub-components
// ────────────────────────────────────────────────────────────────

const safeRender = (val: any) => {
  if (val && typeof val === 'object') {
    return JSON.stringify(val)
  }
  return val
}

function ReportTypeCard({
  report,
  selected,
  onClick,
}: {
  report: typeof REPORT_TYPES[number]
  selected: boolean
  onClick: () => void
}) {
  const Icon = report.icon
  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover:shadow-lg ${selected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'
        }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${report.bg}`}>
          <Icon className={`w-5 h-5 ${report.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{report.title}</h3>
          <p className="text-xs text-gray-500 mt-1">{report.description}</p>
        </div>
        {selected && <Badge className="text-[10px] bg-blue-500 text-white px-1">Aktif</Badge>}
      </div>
    </Card>
  )
}

function IncentiveTable({ data }: { data: any[] }) {
  if (!Array.isArray(data)) {
    return <div>Data must be an array, but received: {typeof data}</div>;
  }
  const headers = [
    'NIP/NIK', 'NAMA PEGAWAI', 'UNIT', 'PROPORSI UNIT',
    'P1', 'P2', 'P3', 'TOTAL INDEKS',
    'INSENTIF PRIORITAS', 'PIR', 'POTONGAN', 'DISTRIBUSI POTONGAN', 'INSENTIF BRUTO', 'PAJAK', 'NETTO'
  ]
  const rightAligned = [
    'PROPORSI UNIT', 'P1', 'P2', 'P3', 'TOTAL INDEKS',
    'INSENTIF PRIORITAS', 'PIR', 'POTONGAN', 'DISTRIBUSI POTONGAN', 'INSENTIF BRUTO', 'PAJAK', 'NETTO'
  ]

  const totalP1 = data.reduce((acc, r) => acc + (Number(r.p1_score) || 0), 0)
  const totalP2 = data.reduce((acc, r) => acc + (Number(r.p2_score) || 0), 0)
  const totalP3 = data.reduce((acc, r) => acc + (Number(r.p3_score) || 0), 0)
  const totalScore = data.reduce((acc, r) => acc + (Number(r.total_score) || 0), 0)
  const totalPriority = data.reduce((acc, r) => acc + (Number(r.total_priority_score) || Number(r.total_activity_rupiah) || Number(r.total_activity) || 0), 0)
  const totalPotongan = data.reduce((acc, r) => acc + (Number(r.potongan) || 0), 0)
  const totalDistribusi = data.reduce((acc, r) => acc + (Number(r.distribusi_potongan) || 0), 0)
  const totalGross = data.reduce((acc, r) => acc + (Number(r.gross_incentive) || 0), 0)
  const totalTax = data.reduce((acc, r) => acc + (Number(r.tax_amount) || 0), 0)
  const totalNet = data.reduce((acc, r) => acc + (Number(r.net_incentive) || 0), 0)

  const isSingleUnit = data.length > 0 && data.every((r: any) => r.unit === data[0].unit)
  const unitAllocation = Number(data[0]?.unit_allocation) || 0
  const diffAlloc = Math.abs(Number(totalGross.toFixed(2)) - Number(unitAllocation.toFixed(2)))

  return (
    <div className="overflow-x-auto space-y-3">
      {isSingleUnit && unitAllocation > 0 && (
        <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="text-gray-500">Unit:</span> <strong className="text-gray-800">{data[0].unit}</strong>
            </div>
            <div>
              <span className="text-gray-500">Alokasi Unit:</span> <strong className="font-mono text-blue-700">{formatCurrency(unitAllocation, true, 2)}</strong>
            </div>
            <div>
              <span className="text-gray-500">Total Insentif Bruto:</span> <strong className="font-mono text-slate-800">{formatCurrency(totalGross, true, 2)}</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {diffAlloc < 0.05 ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                ✓ Insentif Bruto Sama Persis dengan Alokasi Unit (Selisih: Rp 0,00)
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                Selisih: {formatCurrency(diffAlloc, true, 2)}
              </span>
            )}
          </div>
        </div>
      )}

      <table className="w-full border-collapse text-sm min-w-[1100px]">
        <thead>
          <tr className="bg-gray-100">
            {headers.map(h => (
              <th key={h} className={`border p-2 ${rightAligned.includes(h) ? 'text-right' : 'text-left'} font-semibold text-[10px] whitespace-nowrap`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, idx: number) => (
            <tr key={idx} className="hover:bg-gray-50 text-xs text-left">
              <td className="border p-2 whitespace-nowrap">{safeRender(row.employee_code || '-')}</td>
              <td className="border p-2 font-medium min-w-[150px]">{safeRender(row.employee_name)}</td>
              <td className="border p-2 whitespace-nowrap">{safeRender(row.unit)}</td>
              <td className="border p-2 text-right font-mono text-gray-700">{typeof row.unit_proportion === 'string' && row.unit_proportion.includes('%') ? row.unit_proportion : (row.unit_proportion ? `${Number(row.unit_proportion).toFixed(2)}%` : '-')}</td>
              <td className="border p-2 text-right font-mono text-gray-700">{formatNumber(Number(row.p1_score) || 0, 2)}</td>
              <td className="border p-2 text-right font-mono text-gray-700">{formatNumber(Number(row.p2_score) || 0, 2)}</td>
              <td className="border p-2 text-right font-mono text-gray-700">{formatNumber(Number(row.p3_score) || 0, 2)}</td>
              <td className="border p-2 text-right font-bold font-mono text-blue-700">{formatNumber(Number(row.total_score) || 0, 2)}</td>
              <td className="border p-2 text-right font-semibold text-orange-600 font-mono">
                {formatCurrency(Number(row.total_priority_score) || Number(row.total_activity_rupiah) || Number(row.total_activity) || 0, true, 2)}
              </td>
              <td className="border p-2 text-right text-purple-600 font-mono font-medium">{formatCurrency(Number(row.pir_value) || 0, true, 2)}</td>
              <td className="border p-2 text-right font-mono font-medium text-red-600">
                {formatCurrency(Number(row.potongan) || 0, true, 2)}
              </td>
              <td className="border p-2 text-right font-mono font-medium text-emerald-600">
                {formatCurrency(Number(row.distribusi_potongan) || 0, true, 2)}
              </td>
              <td className="border p-2 text-right font-bold font-mono text-slate-800">
                <div className="text-[9px] text-gray-400 font-normal">(Indeks × PIR) + Prioritas + Dist. Pot. - Potongan</div>
                {formatCurrency(Number(row.gross_incentive) || 0, true, 2)}
              </td>
              <td className="border p-2 text-right text-red-600 font-mono">
                {formatCurrency(Number(row.tax_amount) || 0, true, 2)}
                {row.tax_detail && typeof row.tax_detail === 'string' && row.tax_detail !== '-' && (
                  <div className="text-[9px] text-gray-500 italic font-sans">({row.tax_detail})</div>
                )}
              </td>
              <td className="border p-2 text-right font-bold text-green-700 font-mono">
                <div className="text-[9px] text-gray-400 font-normal font-sans">
                  {row.tax_mechanism_used === 'none' ? 'Insentif Bruto' : 'Take Home Pay'}
                </div>
                {formatCurrency(Number(row.net_incentive) || 0, true, 2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-bold text-xs border-t-2 border-gray-300">
            <td colSpan={4} className="border p-2 text-center text-gray-700">TOTAL KESELURUHAN ({data.length} Pegawai)</td>
            <td className="border p-2 text-right font-mono text-gray-700">{formatNumber(totalP1, 2)}</td>
            <td className="border p-2 text-right font-mono text-gray-700">{formatNumber(totalP2, 2)}</td>
            <td className="border p-2 text-right font-mono text-gray-700">{formatNumber(totalP3, 2)}</td>
            <td className="border p-2 text-right font-mono text-blue-700">{formatNumber(totalScore, 2)}</td>
            <td className="border p-2 text-right font-mono text-orange-600">{formatCurrency(totalPriority, true, 2)}</td>
            <td className="border p-2 text-center font-mono text-gray-400">-</td>
            <td className="border p-2 text-right font-mono text-red-600">{formatCurrency(totalPotongan, true, 2)}</td>
            <td className="border p-2 text-right font-mono text-emerald-600">{formatCurrency(totalDistribusi, true, 2)}</td>
            <td className="border p-2 text-right font-mono text-slate-800">{formatCurrency(totalGross, true, 2)}</td>
            <td className="border p-2 text-right font-mono text-red-600">{formatCurrency(totalTax, true, 2)}</td>
            <td className="border p-2 text-right font-mono text-green-700">{formatCurrency(totalNet, true, 2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function UnitComparisonTable({ data }: { data: any[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-gray-100">
          <th className="border p-2 text-left font-semibold text-[10px]">UNIT</th>
          <th className="border p-2 text-right font-semibold text-[10px]">PORSI UNIT</th>
          <th className="border p-2 text-right font-semibold text-[10px]">RATA-RATA SKOR INDEKS</th>
          <th className="border p-2 text-right font-semibold text-[10px]">TOTAL PRIORITAS (RP)</th>
          <th className="border p-2 text-right font-semibold text-[10px]">TOTAL POIN INDEKS UNIT</th>
          <th className="border p-2 text-right font-semibold text-[10px]">TOTAL AKTIVITAS UNIT (RP)</th>
          <th className="border p-2 text-right font-semibold text-[10px]">PIR UNIT</th>
          <th className="border p-2 text-right font-semibold text-[10px]">TOTAL INSENTIF</th>
          <th className="border p-2 text-right font-semibold text-[10px]">JUMLAH PEGAWAI</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row: any, idx: number) => (
          <tr key={idx} className="hover:bg-gray-50 text-xs">
            <td className="border p-2 font-medium">{safeRender(row.unit_name)}</td>
            <td className="border p-2 text-right font-mono text-gray-700">{row.unit_proportion}</td>
            <td className="border p-2 text-right font-bold text-blue-700">{formatNumber(row.average_score || 0, 2)}</td>
            <td className="border p-2 text-right text-orange-600">{formatCurrency(row.total_priority || 0)}</td>
            <td className="border p-2 text-right">{formatNumber(row.total_unit_score || 0, 2)}</td>
            <td className="border p-2 text-right text-orange-700">{formatCurrency(row.total_unit_activity || 0)}</td>
            <td className="border p-2 text-right text-purple-600">{formatCurrency(row.pir_value || 0, true, 2)}</td>
            <td className="border p-2 text-right font-bold text-green-700">{formatCurrency(row.total_incentive || 0)}</td>
            <td className="border p-2 text-right">{safeRender(row.employee_count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function KPIAchievementTable({ data }: { data: any[] }) {
  const indexData = data.filter(d => !d.is_activity)
  const activityData = data.filter(d => d.is_activity)

  return (
    <div className="space-y-6">
      {indexData.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-blue-700">KATEGORI BERBASIS INDEKS</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left font-semibold">NAMA</th>
                <th className="border p-2 text-left font-semibold">INDIKATOR</th>
                <th className="border p-2 text-right font-semibold">BOBOT</th>
                <th className="border p-2 text-right font-semibold">PENCAPAIAN</th>
              </tr>
            </thead>
            <tbody>
              {indexData.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border p-2 font-medium">{safeRender(row.employee_name || row.unit_name)}</td>
                  <td className="border p-2">{safeRender(row.indicator || row.indicator_name)}</td>
                  <td className="border p-2 text-right">{formatNumber(row.weight || 0, 2)}%</td>
                  <td className="border p-2 text-right font-bold text-blue-700">{formatNumber(row.achievement_percentage || 0, 2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activityData.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-orange-700">KATEGORI BERBASIS AKTIVITAS</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left font-semibold">NAMA</th>
                <th className="border p-2 text-left font-semibold">INDIKATOR</th>
                <th className="border p-2 text-right font-semibold">VOLUME / REALISASI</th>
              </tr>
            </thead>
            <tbody>
              {activityData.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border p-2 font-medium">{safeRender(row.employee_name || row.unit_name)}</td>
                  <td className="border p-2">{safeRender(row.indicator || row.indicator_name)}</td>
                  <td className="border p-2 text-right font-bold text-orange-700">
                    {safeRender(row.realization_value || row.achievement)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('all')
  const [selectedEmployee, setSelectedEmployee] = useState('all')
  const [selectedRevenueType, setSelectedRevenueType] = useState<'all' | 'bpjs' | 'umum'>('bpjs')
  const [detailLevel, setDetailLevel] = useState<'summary' | 'detail'>('summary')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [reportData, setReportData] = useState<any>(null)
  const [availableUnits, setAvailableUnits] = useState<any[]>([])
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [userProfile, setUserProfile] = useState<any>(null)
  const [reportSummary, setReportSummary] = useState<any>(null)

  useEffect(() => {
    setIsMounted(true)

    const fetchWithRetry = async (url: string, retries = 3, delay = 500) => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(url)
          if (res.ok) {
            return await res.json()
          }
        } catch (e) {
          if (i === retries - 1) console.error(`Failed to fetch ${url} after ${retries} tries:`, e)
        }
        await new Promise(r => setTimeout(r, delay * (i + 1)))
      }
      return null
    }

    const fetchMetadata = async () => {
      try {
        const [units, employees, profile] = await Promise.all([
          fetchWithRetry('/api/reports/generate/metadata?type=units'),
          fetchWithRetry('/api/reports/generate/metadata?type=employees'),
          fetchWithRetry('/api/profile'),
        ])

        if (units?.data) {
          setAvailableUnits(units.data)
        }
        if (employees?.data) {
          setAvailableEmployees(employees.data)
        }

        if (profile?.success && profile?.data) {
          setUserProfile(profile.data)
          // If unit manager, auto-select their unit
          if (profile.data.role === 'unit_manager' && profile.data.unit_id) {
            setSelectedUnit(profile.data.unit_id)
          } else if (profile.data.role === 'superadmin' || profile.data.role === 'admin') {
            setSelectedUnit('all')
          }
        }
      } catch (err) {
        console.error('Error fetching metadata:', err)
      }
    }
    fetchMetadata()
  }, [])

  const handleGenerateReport = async () => {
    if (!selectedReport || !selectedPeriod) {
      setError('Pilih jenis laporan dan periode')
      return
    }
    setIsGenerating(true)
    setGenerationProgress(0)
    setError(null)
    setReportSummary(null)

    // Simulate progress
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) return prev
        return prev + 5
      })
    }, 500)

    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: selectedReport,
          period: selectedPeriod,
          unitId: selectedUnit === 'all' ? null : selectedUnit,
          employeeId: selectedEmployee === 'all' ? null : selectedEmployee,
          revenueType: selectedRevenueType,
          detailLevel,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login?error=session_expired'
          return
        }
        throw new Error(data.error || 'Gagal membuat laporan')
      }

      // Capture summary from API
      if (data.summary) {
        setReportSummary(data.summary)
      }

      setGenerationProgress(100)
      if (data.data?.length === 0) {
        const msg = data.message || `Tidak ada data untuk periode ${selectedPeriod}`
        setError(msg)
        setReportData(null)
        toast.error(msg, {
          icon: <AlertCircle className="w-4 h-4 text-red-500" />
        })
      } else {
        setReportData(data.data)
        toast.success(`Laporan berhasil dibuat (${data.data.length} pegawai)`, {
          icon: <CheckCircle2 className="w-4 h-4 text-green-500" />
        })
      }
    } catch (err) {
      clearInterval(progressInterval)
      setGenerationProgress(0)
      const msg = (err as Error).message
      setError(msg)
      setReportData(null)
      toast.error(msg)
    } finally {
      clearInterval(progressInterval)
      setIsGenerating(false)
    }
  }

  const handleDownloadGuide = async () => {
    try {
      const unitName = selectedUnit === 'all'
        ? 'Seluruh Unit'
        : availableUnits.find(u => u.id === selectedUnit)?.name || 'Unit'

      const response = await fetch('/api/reports/assessment-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitName, unitId: selectedUnit === 'all' ? null : selectedUnit }),
      })
      if (!response.ok) throw new Error('Gagal mengunduh petunjuk')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `Petunjuk_Penilaian_${unitName.replace(/\s+/g, '_')}.pdf` })
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleExport = async (format: 'excel' | 'pdf') => {
    if (!reportData || !selectedReport || !selectedPeriod) return
    try {
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: selectedReport, period: selectedPeriod, format, data: reportData, revenueType: selectedRevenueType }),
      })
      if (!response.ok) throw new Error('Ekspor gagal')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `${selectedReport}-${selectedPeriod}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
      })
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const filteredEmployees = availableEmployees.filter(e =>
    (selectedUnit === 'all' || e.unit_id === selectedUnit) &&
    (searchTerm === '' || e.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (!isMounted) return <div className="p-6 text-sm text-gray-500">Memuat...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Laporan</h1>
          <p className="text-gray-600 mt-1">Buat dan ekspor berbagai laporan kinerja</p>
        </div>
        <Button
          onClick={handleDownloadGuide}
          variant="outline"
          className="flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          <ClipboardCheck className="w-4 h-4" />
          Unduh Petunjuk Penilaian
        </Button>
      </div>

      {/* Report Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {REPORT_TYPES
          .filter(report => !(userProfile?.role === 'unit_manager' && report.id === 'unit-comparison'))
          .map(report => (
            <ReportTypeCard
              key={report.id}
              report={report}
              selected={selectedReport === report.id}
              onClick={() => {
                setSelectedReport(report.id)
                setReportData(null)
                setError(null)
              }}
            />
          ))}
      </div>

      {/* Filters & Actions */}
      {selectedReport && (
        <Card className="p-6">
          <div className="space-y-6">
            {/* Progress Bar when generating */}


            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Period */}
              <div className="space-y-1">
                <Label>Pilih Periode</Label>
                <Input
                  type="month"
                  value={selectedPeriod}
                  onChange={e => setSelectedPeriod(e.target.value)}
                />
              </div>

              {/* Unit */}
              {selectedReport !== 'unit-comparison' && (
                <div className="space-y-1">
                  <Label>Unit Kerja</Label>
                  <Select
                    value={selectedUnit}
                    onValueChange={v => { setSelectedUnit(v); setSelectedEmployee('all') }}
                    disabled={userProfile?.role === 'unit_manager'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {userProfile?.role !== 'unit_manager' && <SelectItem value="all">Semua Unit</SelectItem>}
                      {availableUnits.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Employee Search */}
              {selectedReport !== 'unit-comparison' && (
                <div className="space-y-1">
                  <Label>Cari &amp; Pilih Pegawai</Label>
                  <Input
                    placeholder="Cari nama..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="mb-1"
                  />
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Semua Pegawai" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Pegawai</SelectItem>
                      {filteredEmployees.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name} ({e.employee_code || '-'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Revenue Type Filter */}
              <div className="space-y-1">
                <Label>Jenis Pendapatan</Label>
                <Select value={selectedRevenueType} onValueChange={(v: any) => setSelectedRevenueType(v)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Pilih Jenis Pendapatan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bpjs">BPJS Kesehatan Only</SelectItem>
                    <SelectItem value="umum">Pendapatan UMUM Only</SelectItem>
                    <SelectItem value="all">Konsolidasi (Gabungan BPJS &amp; UMUM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Detail Level */}
              {selectedReport === 'kpi-achievement' && (
                <div className="space-y-1">
                  <Label>Level Detail</Label>
                  <Select value={detailLevel} onValueChange={v => setDetailLevel(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="summary">Ringkasan (Rekap)</SelectItem>
                      <SelectItem value="detail">Detail (Sub-Indikator)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleGenerateReport}
                disabled={!selectedReport || !selectedPeriod || isGenerating}
              >
                {isGenerating ? 'Membuat Laporan...' : 'Buat Laporan'}
              </Button>

              {reportData && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="bg-red-600 hover:bg-red-700 text-white">
                      <Download className="w-4 h-4 mr-2" />
                      Unduh Laporan
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleExport('pdf')} className="cursor-pointer">
                      <FileDown className="w-4 h-4 mr-2 text-red-600" />
                      Format PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('excel')} className="cursor-pointer">
                      <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                      Format Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {isGenerating && (
              <div className="space-y-2 py-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Memproses data insentif...</span>
                  <span>{generationProgress}%</span>
                </div>
                <Progress value={generationProgress} className="h-2" />
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Report Summary Stats */}
      {reportSummary && (
        <Card className="p-4 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-xs text-gray-500">Total Pegawai</div>
                <div className="text-lg font-bold text-blue-700">{reportSummary.total_employees}</div>
              </div>
            </div>
            <div className="h-8 border-r border-gray-200" />
            <div>
              <div className="text-xs text-gray-500">Sudah Dinilai</div>
              <div className="text-lg font-bold text-green-600">{reportSummary.total_assessed}</div>
            </div>
            <div className="h-8 border-r border-gray-200" />
            <div>
              <div className="text-xs text-gray-500">Belum Dinilai</div>
              <div className="text-lg font-bold text-orange-600">{(reportSummary.total_employees || 0) - (reportSummary.total_assessed || 0)}</div>
            </div>
            <div className="h-8 border-r border-gray-200" />
            <div>
              <div className="text-xs text-gray-500">Penyelesaian Penilaian</div>
              <div className="flex items-center gap-2">
                <div className="text-lg font-bold text-purple-700">{reportSummary.completion_percentage}%</div>
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${reportSummary.completion_percentage}%`,
                      backgroundColor: reportSummary.completion_percentage >= 80 ? '#16a34a' : reportSummary.completion_percentage >= 50 ? '#f59e0b' : '#ef4444'
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="h-8 border-r border-gray-200" />
            <div>
              <div className="text-xs text-gray-500">Ditampilkan di Laporan</div>
              <div className="text-lg font-bold text-gray-700">{reportSummary.total_displayed} <span className="text-xs font-normal text-gray-400">pegawai</span></div>
            </div>
          </div>
        </Card>
      )}

      {/* Unit Comparison Stats */}
      {selectedReport === 'unit-comparison' && reportData && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-purple-700 flex items-center gap-2">
            <BarChart2 className="w-5 h-5" />
            Statistik Performa Unit
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reportData.map((row: any, idx: number) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:shadow-md transition-shadow">
                <div className="text-sm text-gray-500">{row.unit_name}</div>
                <div className="text-2xl font-bold text-blue-600">{formatNumber(row.average_score || 0, 2)}</div>
                <div className="text-xs text-gray-400 mt-1">{row.employee_count} Pegawai</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Report Preview */}
      {reportData && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Pratinjau Laporan</h2>

          <div className="overflow-x-auto">
            {(selectedReport === 'incentive' || selectedReport === 'employee-slip') ? (
              <IncentiveTable data={reportData} />
            ) : selectedReport === 'unit-comparison' ? (
              <UnitComparisonTable data={reportData} />
            ) : (
              <KPIAchievementTable data={reportData} />
            )}
          </div>
        </Card >
      )
      }
    </div >
  )
}
