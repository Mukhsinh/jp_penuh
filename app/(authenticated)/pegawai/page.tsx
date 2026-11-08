'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getPegawaiWithUnits,
  getPegawaiStats,
  getUnitsForDropdown,
  getEmployeePeriodsAction,
  lockEmployeePeriodAction,
  unlockEmployeePeriodAction,
  clearDraftEmployeePeriodAction
} from './actions'
import { formatPeriodToMonthName } from '@/lib/utils/format'
import type { EmployeePeriod } from '@/lib/types/database.types'
import {
  Plus,
  Search,
  RefreshCw,
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertCircle,
  XCircle,
  CheckCircle2,
  FileDown,
  Users,
  Award,
  Briefcase,
  BarChart3,
  PieChart as PieChartIcon,
  Building2,
  Filter,
  Lock,
  Unlock,
  RotateCcw,
  Calendar,
  ArrowRightLeft,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PegawaiTable } from '@/components/pegawai/PegawaiTable'
import { PegawaiFormDialog } from '@/components/pegawai/PegawaiFormDialog'
import { PegawaiRotateDialog } from '@/components/pegawai/PegawaiRotateDialog'
import { CreatePeriodDialog } from '@/components/pegawai/CreatePeriodDialog'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import type { Pegawai } from '@/lib/types/database.types'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import * as XLSX from 'xlsx'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts'

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

export default function PegawaiPage() {
  const router = useRouter()
  const [pegawai, setPegawai] = useState<Pegawai[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedPegawai, setSelectedPegawai] = useState<Pegawai | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStatus, setImportStatus] = useState('')

  // Period management state
  const [periods, setPeriods] = useState<EmployeePeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-01')
  const [periodInfo, setPeriodInfo] = useState<{
    is_locked: boolean;
    period_name: string;
    locked_at?: string | null;
    locked_by?: string | null;
  } | null>(null)
  const [showCreatePeriodDialog, setShowCreatePeriodDialog] = useState(false)
  const [showRotateDialog, setShowRotateDialog] = useState(false)
  const [pegawaiToRotate, setPegawaiToRotate] = useState<Pegawai | null>(null)
  const [lockingPeriod, setLockingPeriod] = useState(false)
  const [resettingPeriod, setResettingPeriod] = useState(false)

  // Stats state
  const [stats, setStats] = useState<{
    total: number;
    byGrade: Array<{ name: string; value: number }>;
    byStatus: Array<{ name: string; value: number }>;
    byUnit: Array<{ name: string; value: number }>;
  } | null>(null)

  // Unit filter state
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all')
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([])
  const [unitsLoading, setUnitsLoading] = useState(false)

  // State for detailed import results
  const [showImportResult, setShowImportResult] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    total: number;
    failedRows: Array<{
      rowNumber: number;
      code: string;
      name: string;
      reason: string;
      data: any;
    }>;
  } | null>(null)

  const [pageSize, setPageSize] = useState<number>(50)
  const debouncedSearchTerm = useDebounce(searchTerm, 500)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Load available periods
  const loadPeriods = useCallback(async () => {
    try {
      const res = await getEmployeePeriodsAction()
      if (res.data && res.data.length > 0) {
        setPeriods(res.data)
        // If selectedPeriod is not in res.data, select the first one (most recent)
        if (!res.data.some(p => p.period === selectedPeriod)) {
          setSelectedPeriod(res.data[0].period)
        }
      }
    } catch (err) {
      console.error('Failed to load periods:', err)
    }
  }, [selectedPeriod])

  const loadPegawai = useCallback(async (overridePeriod?: string) => {
    const periodToUse = overridePeriod !== undefined ? overridePeriod : selectedPeriod
    setLoading(true)
    try {
      const result = await getPegawaiWithUnits(currentPage, pageSize, debouncedSearchTerm, selectedUnitId, periodToUse)
      if (result.error) {
        setError(result.error)
      } else {
        setPegawai(result.data)
        setTotalCount(result.count)
        if (result.periodInfo) {
          setPeriodInfo(result.periodInfo)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data pegawai')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, debouncedSearchTerm, selectedUnitId, selectedPeriod])

  const loadStats = useCallback(async (overridePeriod?: string) => {
    const periodToUse = overridePeriod !== undefined ? overridePeriod : selectedPeriod
    setStatsLoading(true)
    try {
      const result = await getPegawaiStats(selectedUnitId, periodToUse)
      if (!result.error) {
        setStats(result)
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }, [selectedUnitId, selectedPeriod])

  const loadUnits = useCallback(async () => {
    setUnitsLoading(true)
    try {
      const result = await getUnitsForDropdown()
      if (!result.error) {
        setUnits(result.data)
      }
    } catch (err) {
      console.error('Failed to load units:', err)
    } finally {
      setUnitsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPeriods()
  }, [loadPeriods])

  useEffect(() => {
    loadUnits()
  }, [loadUnits])

  useEffect(() => {
    loadPegawai()
  }, [loadPegawai])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Handle Lock Period Action
  const handleLockPeriod = async () => {
    const periodName = periodInfo?.period_name || formatPeriodToMonthName(selectedPeriod)
    const confirmMsg = `Konfirmasi Penetapan & Penguncian Periode:\n\nApakah Anda yakin ingin MENETAPKAN dan MENGUNCI periode "${periodName}"?\n\nSetelah dikunci:\n1. Rincian seluruh pegawai dan unit kerja pada periode ini akan TERKUNCI secara permanen.\n2. Data ini digunakan sebagai acuan dasar mutlak penilaian KPI (/assessment) dan Laporan Insentif (/reports).\n3. Rotasi/mutasi pada bulan berikutnya tidak akan menggeser periode yang sudah dikunci ini.`

    if (!window.confirm(confirmMsg)) return

    setLockingPeriod(true)
    try {
      const res = await lockEmployeePeriodAction(selectedPeriod)
      if (res.success) {
        toast.success(`Periode ${periodName} berhasil ditetapkan dan dikunci!`)
        await loadPeriods()
        await loadPegawai()
      } else {
        toast.error(res.error || 'Gagal mengunci periode')
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan sistem')
    } finally {
      setLockingPeriod(false)
    }
  }

  // Handle Unlock Period Action
  const handleUnlockPeriod = async () => {
    const periodName = periodInfo?.period_name || formatPeriodToMonthName(selectedPeriod)
    const confirmMsg = `PERINGATAN PEMBUKAAN KUNCI:\n\nApakah Anda yakin ingin MEMBUKA KUNCI periode "${periodName}"?\n\nKunci hanya disarankan dibuka jika terdapat kesalahan input penempatan pegawai mendesak yang perlu diperbaiki.`

    if (!window.confirm(confirmMsg)) return

    setLockingPeriod(true)
    try {
      const res = await unlockEmployeePeriodAction(selectedPeriod)
      if (res.success) {
        toast.success(`Kunci periode ${periodName} berhasil dibuka kembali.`)
        await loadPeriods()
        await loadPegawai()
      } else {
        toast.error(res.error || 'Gagal membuka kunci periode')
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan sistem')
    } finally {
      setLockingPeriod(false)
    }
  }

  // Handle Reset / Clear Data Draft Period
  const handleResetDraftPeriod = async () => {
    if (isCurrentPeriodLocked) {
      toast.warning('Periode ini telah dikunci. Reset data hanya dapat dilakukan pada periode berstatus draf.')
      return
    }

    const periodName = periodInfo?.period_name || formatPeriodToMonthName(selectedPeriod)
    const confirmed = window.confirm(
      `PERINGATAN CLEAR DATA / RESET PERIODE:\n\nApakah Anda yakin ingin menghapus seluruh data pegawai dan membatalkan periode "${periodName}"?\n\nPeriode ini akan dikosongkan dan kembali ke status "belum dibuat". Anda dapat membukanya kembali nanti dengan menyalin data dari periode sebelumnya yang telah terkunci.\n\nTindakan ini tidak dapat dibatalkan!`
    )
    if (!confirmed) return

    setResettingPeriod(true)
    try {
      const res = await clearDraftEmployeePeriodAction(selectedPeriod)
      if (res.success) {
        const target = res.nextPeriod || '2026-01'
        if (res.nextPeriodInfo) {
          setPeriodInfo(res.nextPeriodInfo)
        }
        setSelectedPeriod(target)
        setCurrentPage(1)
        await loadPeriods()
        await loadPegawai(target)
        await loadStats(target)
        toast.success(`Berhasil! Data pegawai dan periode ${periodName} telah dibersihkan. Periode sebelumnya tetap tersimpan dan terkunci aman.`)
      } else {
        toast.error(res.error || 'Gagal mereset data periode')
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan sistem')
    } finally {
      setResettingPeriod(false)
    }
  }

  // Handle Rotate Click
  const handleRotateClick = (p: Pegawai) => {
    setPegawaiToRotate(p)
    setShowRotateDialog(true)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (periodInfo?.is_locked) {
      toast.error(`Periode ${periodInfo.period_name || selectedPeriod} telah dikunci. Import data pegawai baru hanya dapat dilakukan pada periode terbuka.`)
      if (event.target) event.target.value = ''
      return
    }

    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportProgress(5)
    setImportStatus('Mengunggah file...')
    setImportResult(null)

    const formData = new FormData()
    formData.append('file', file)

    let progressStep = 0
    const statusMessages = [
      'Mengunggah file...',
      'Memvalidasi struktur data...',
      'Memeriksa unit kerja...',
      'Menyinkronkan database...',
      'Memproses batch upsert...',
      'Menyelesaikan import...'
    ]

    const progressInterval = setInterval(() => {
      setImportProgress(prev => {
        if (prev >= 95) return 95
        return prev + 3
      })
      progressStep++
      const msgIdx = Math.min(Math.floor(progressStep / 3), statusMessages.length - 1)
      setImportStatus(statusMessages[msgIdx])
    }, 1500)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)

    try {
      const response = await fetch('/api/pegawai/import', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      clearInterval(progressInterval)
      setImportProgress(100)
      setImportStatus('Selesai!')

      const result = await response.json()

      if (response.ok) {
        setImportResult(result)
        if (result.failed > 0) {
          setShowImportResult(true)
        }
        toast.success(`Import selesai: ${result.success} berhasil, ${result.failed} gagal`)
        loadPegawai()
        loadStats()
      } else {
        toast.error(`Gagal import: ${result.error || 'Terjadi kesalahan server'}`)
      }
    } catch (err: any) {
      clearTimeout(timeoutId)
      clearInterval(progressInterval)
      if (err.name === 'AbortError') {
        toast.error('Proses import timeout (lebih dari 5 menit). Silakan coba dengan file yang lebih kecil.')
      } else {
        toast.error(`Terjadi kesalahan sistem: ${err.message}`)
      }
    } finally {
      setTimeout(() => {
        setImporting(false)
        setImportProgress(0)
      }, 1500)
      if (event.target) event.target.value = ''
    }
  }

  const handleDownloadErrorReport = () => {
    if (!importResult || !importResult.failedRows.length) return
    const dataToExport = importResult.failedRows.map(row => ({
      'Baris': row.rowNumber,
      'Kode': row.code,
      'Nama': row.name,
      'Alasan Gagal': row.reason,
      ...row.data
    }))
    const ws = XLSX.utils.json_to_sheet(dataToExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gagal_Import')
    XLSX.writeFile(wb, `Gagal_Import_Pegawai_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleDownloadTemplate = () => {
    window.open('/api/pegawai/template', '_blank')
  }

  const handleEdit = (p: Pegawai) => {
    setSelectedPegawai(p)
    setShowCreateDialog(true)
  }

  const handleCloseDialog = () => {
    setShowCreateDialog(false)
    setSelectedPegawai(null)
  }

  const handleSuccess = () => {
    handleCloseDialog()
    loadPegawai()
    loadStats()
  }

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

  const isCurrentPeriodLocked = periodInfo?.is_locked ?? true

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Import Progress Bar */}
      {importing && (
        <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{importStatus}</p>
                <p className="text-xs text-gray-500">Mohon tunggu hingga proses sinkronisasi selesai</p>
              </div>
            </div>
            <span className="text-sm font-bold text-blue-600 tabular-nums">{importProgress}%</span>
          </div>
          <div className="h-2 w-full bg-blue-50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Import Result Dialog */}
      <Dialog open={showImportResult} onOpenChange={setShowImportResult}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-900">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
              Laporan Hasil Import
            </DialogTitle>
            <DialogDescription>
              Ringkasan proses import data pegawai
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-4 my-4">
            <div className="p-4 rounded-xl bg-green-50 border border-green-100 flex flex-col items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mb-1" />
              <span className="text-2xl font-bold text-green-700">{importResult?.success || 0}</span>
              <span className="text-xs text-green-600 font-medium">Berhasil</span>
            </div>
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex flex-col items-center justify-center">
              <XCircle className="h-8 w-8 text-red-600 mb-1" />
              <span className="text-2xl font-bold text-red-700">{importResult?.failed || 0}</span>
              <span className="text-xs text-red-600 font-medium">Gagal</span>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center">
              <FileSpreadsheet className="h-8 w-8 text-blue-600 mb-1" />
              <span className="text-2xl font-bold text-blue-700">{importResult?.total || 0}</span>
              <span className="text-xs text-blue-600 font-medium">Total Baris</span>
            </div>
          </div>

          {importResult && importResult.failedRows.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col mt-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">Detail Baris Gagal</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadErrorReport}
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Laporan Gagal
                </Button>
              </div>
              <div className="flex-1 overflow-auto border rounded-lg">
                <Table>
                  <TableHeader className="bg-gray-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-20">Baris</TableHead>
                      <TableHead className="w-40">Kode/Nama</TableHead>
                      <TableHead>Alasan Kegagalan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.failedRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{row.code || '-'}</span>
                            <span className="text-[10px] text-gray-500 truncate max-w-[150px]">{row.name || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-red-600 bg-red-50/30">{row.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 pt-4 border-t">
            <Button onClick={() => setShowImportResult(false)} className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800">
              Tutup Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Master Pegawai</h1>
          <p className="text-sm text-gray-500 font-medium">Penetapan penempatan pegawai per periode bulan &amp; manajemen personel</p>
        </div>
        <div className="grid grid-cols-2 md:flex md:flex-wrap lg:flex-nowrap gap-2 w-full sm:w-auto">
          <Button
            onClick={handleDownloadTemplate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Template
          </Button>

          <Button
            onClick={() => {
              if (isCurrentPeriodLocked) {
                toast.warning(`Periode ${periodInfo?.period_name || selectedPeriod} telah dikunci. Buka kunci terlebih dahulu jika ingin mengimport ke periode ini.`)
                return
              }
              document.getElementById('import-pegawai')?.click()
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs md:text-sm"
            disabled={importing}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <input id="import-pegawai" type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />

          <Button
            onClick={() => {
              if (isCurrentPeriodLocked) {
                toast.warning(`Periode ${periodInfo?.period_name || selectedPeriod} telah dikunci. Pegawai baru hanya dapat ditambahkan pada periode terbuka.`)
                return
              }
              setShowCreateDialog(true)
            }}
            className="col-span-2 md:col-span-1 text-xs md:text-sm bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Tambah Pegawai
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
                <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Periode Penetapan Pegawai</span>
                  <div className="w-56 sm:w-64 mt-0.5">
                    <Select
                      value={selectedPeriod}
                      onValueChange={(val) => {
                        setSelectedPeriod(val)
                        setCurrentPage(1)
                      }}
                    >
                      <SelectTrigger className="bg-white border-indigo-200 font-semibold text-slate-800 shadow-sm">
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
              <div className="flex items-center gap-2 pt-4 sm:pt-4">
                {isCurrentPeriodLocked ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs">
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    Ditetapkan &amp; Dikunci
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 shadow-xs">
                    <Unlock className="w-3.5 h-3.5 text-amber-600" />
                    Draf / Terbuka (Bisa Mutasi)
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
                  className="border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-medium"
                  title="Buka kunci untuk melakukan perbaikan darurat"
                >
                  {lockingPeriod ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Unlock className="w-3.5 h-3.5 mr-1.5" />}
                  Buka Kunci Periode
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={handleLockPeriod}
                    disabled={lockingPeriod || resettingPeriod}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                  >
                    {lockingPeriod ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
                    Tetapkan &amp; Kunci Periode Ini
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetDraftPeriod}
                    disabled={lockingPeriod || resettingPeriod}
                    className="border-rose-300 bg-rose-50/70 text-rose-700 hover:bg-rose-100 hover:text-rose-800 text-xs font-semibold shadow-xs transition-colors"
                    title="Hapus seluruh data pegawai dan batalkan periode draf ini agar kembali menjadi belum dibuat"
                  >
                    {resettingPeriod ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 text-rose-600" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                    )}
                    Clear Data
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreatePeriodDialog(true)}
                className="bg-white border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Buka Periode Baru (Bulan Berikutnya)
              </Button>
            </div>
          </div>

          {/* Context Explanatory Notice (Only when open) */}
          {!isCurrentPeriodLocked && (
            <div className="mt-3 pt-3 border-t border-indigo-100/80 flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-slate-600 leading-relaxed">
                Periode <strong className="text-slate-800">{periodInfo?.period_name || formatPeriodToMonthName(selectedPeriod)}</strong> sedang <strong>terbuka</strong>. Anda dapat melakukan rotasi/mutasi penempatan pegawai antar unit kerja menggunakan tombol <ArrowRightLeft className="w-3.5 h-3.5 inline mx-0.5 text-indigo-600" /> pada daftar pegawai. Setelah selesai disesuaikan, klik <strong>"Tetapkan &amp; Kunci Periode Ini"</strong>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter Section */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-2 text-gray-500 font-medium">
          <Filter className="h-4 w-4" />
          <span className="text-sm">Filter Unit:</span>
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={selectedUnitId}
            onValueChange={(val) => {
              setSelectedUnitId(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="bg-gray-50 border-gray-200">
              <SelectValue placeholder="Pilih Unit Kerja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Unit Kerja</SelectItem>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedUnitId !== 'all' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedUnitId('all')}
            className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
          >
            Bersihkan Filter
          </Button>
        )}
      </div>

      {/* Statistics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Pegawai */}
        <Card className="border-none shadow-sm bg-indigo-50/50 backdrop-blur-sm overflow-hidden relative group">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <Users size={100} />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-indigo-600 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Pegawai ({formatPeriodToMonthName(selectedPeriod)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 w-16 bg-indigo-200 animate-pulse rounded" />
            ) : (
              <div className="text-3xl font-bold text-indigo-900">{stats?.total || 0}</div>
            )}
            <p className="text-xs text-indigo-600 mt-1">Personel aktif pada periode ini</p>
          </CardContent>
        </Card>

        {/* Top Grade */}
        <Card className="border-none shadow-sm bg-emerald-50/50 backdrop-blur-sm overflow-hidden relative group">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <Award size={100} />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600 flex items-center gap-2">
              <Award className="h-4 w-4" />
              Golongan Terbanyak
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 w-24 bg-emerald-200 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold text-emerald-900 truncate">
                {stats?.byGrade[0]?.name || '-'}
                <span className="text-sm font-normal text-emerald-600 ml-2">({stats?.byGrade[0]?.value || 0})</span>
              </div>
            )}
            <p className="text-xs text-emerald-600 mt-1">Distribusi kepangkatan utama</p>
          </CardContent>
        </Card>

        {/* Top Status */}
        <Card className="border-none shadow-sm bg-amber-50/50 backdrop-blur-sm overflow-hidden relative group">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <Briefcase size={100} />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Status Terbanyak
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 w-24 bg-amber-200 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold text-amber-900 truncate">
                {stats?.byStatus[0]?.name || '-'}
                <span className="text-sm font-normal text-amber-600 ml-2">({stats?.byStatus[0]?.value || 0})</span>
              </div>
            )}
            <p className="text-xs text-amber-600 mt-1">Dominasi jenis kepegawaian</p>
          </CardContent>
        </Card>

        {/* Unit Summary */}
        <Card className="border-none shadow-sm bg-rose-50/50 backdrop-blur-sm overflow-hidden relative group">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <BarChart3 size={100} />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rose-600 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Total Unit Aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 w-16 bg-rose-200 animate-pulse rounded" />
            ) : (
              <div className="text-3xl font-bold text-rose-900">{stats?.byUnit.length || 0}</div>
            )}
            <p className="text-xs text-rose-600 mt-1">Unit kerja terisi pegawai</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold">
                Daftar Pegawai &amp; Unit Kerja ({formatPeriodToMonthName(selectedPeriod)})
              </CardTitle>
              <CardDescription>
                Menampilkan {pegawai.length} dari {totalCount} pegawai pada periode {formatPeriodToMonthName(selectedPeriod)}
              </CardDescription>
            </div>
            {isCurrentPeriodLocked && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-md text-xs font-semibold text-slate-700 border">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                Periode Terkunci (Read-Only)
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-800 text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="mb-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Cari berdasarkan nama, kode pegawai, jabatan..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 h-10 bg-gray-50/50 focus:bg-white transition-colors"
              />
              {searchTerm !== debouncedSearchTerm && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <LoadingSpinner size="sm" />
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={loadPegawai}
              disabled={loading}
              className="h-10 px-4 whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </Button>
          </div>

          <PegawaiTable
            pegawai={pegawai}
            loading={loading}
            onEdit={handleEdit}
            onRefresh={loadPegawai}
            isLocked={isCurrentPeriodLocked}
            selectedPeriod={selectedPeriod}
            onRotateUnit={handleRotateClick}
          />

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 font-medium">Tampilkan:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-28 bg-gray-50 border-gray-200 text-xs">
                  <SelectValue placeholder="Baris" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 baris</SelectItem>
                  <SelectItem value="100">100 baris</SelectItem>
                  <SelectItem value="200">200 baris</SelectItem>
                  <SelectItem value="500">500 baris</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || loading}
                className="h-8 text-xs"
              >
                Sebelumnya
              </Button>
              <span className="text-xs text-gray-600 px-2 font-medium">
                Halaman {currentPage} dari {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                className="h-8 text-xs"
              >
                Selanjutnya
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pegawai Form Dialog */}
      <PegawaiFormDialog
        open={showCreateDialog}
        onClose={handleCloseDialog}
        onSuccess={handleSuccess}
        pegawai={selectedPegawai}
        selectedPeriod={selectedPeriod}
      />

      {/* Unit Rotation Dialog */}
      <PegawaiRotateDialog
        open={showRotateDialog}
        onClose={() => {
          setShowRotateDialog(false)
          setPegawaiToRotate(null)
        }}
        onSuccess={() => {
          loadPegawai()
          loadStats()
        }}
        pegawai={pegawaiToRotate}
        period={selectedPeriod}
        periodName={periodInfo?.period_name || formatPeriodToMonthName(selectedPeriod)}
        units={units}
      />

      {/* Create Next Period Dialog */}
      <CreatePeriodDialog
        open={showCreatePeriodDialog}
        onClose={() => setShowCreatePeriodDialog(false)}
        onSuccess={async (newPeriod) => {
          await loadPeriods()
          setSelectedPeriod(newPeriod)
          setCurrentPage(1)
        }}
        existingPeriods={periods}
      />
    </div>
  )
}
