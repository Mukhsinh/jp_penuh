'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getPegawaiWithUnits, getPegawaiStats, getUnitsForDropdown } from './actions'
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
  Filter
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

  const loadPegawai = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getPegawaiWithUnits(currentPage, pageSize, debouncedSearchTerm, selectedUnitId)
      if (result.error) {
        setError(result.error)
      } else {
        setPegawai(result.data)
        setTotalCount(result.count)
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data pegawai')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, debouncedSearchTerm, selectedUnitId])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const result = await getPegawaiStats(selectedUnitId)
      if (!result.error) {
        setStats(result)
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }, [selectedUnitId])

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

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    // Use AbortController with 5-minute timeout to prevent browser timeout
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
          toast.warning(`Import selesai: ${result.success} berhasil, ${result.failed} gagal.`)
        } else {
          toast.success(`Berhasil mengimport ${result.success} data pegawai.`)
        }
        loadPegawai()
        loadStats()
      } else {
        toast.error(result.error || 'Terjadi kesalahan saat import')
      }
    } catch (err: any) {
      clearTimeout(timeoutId)
      clearInterval(progressInterval)
      if (err.name === 'AbortError') {
        toast.error('Import timeout — file terlalu besar atau server terlalu lambat. Coba lagi.')
      } else {
        toast.error('Koneksi gagal saat mencoba import. Periksa koneksi internet.')
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

  const handleDownloadReport = (type: 'excel' | 'pdf') => {
    toast.info('Generating report...')
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

  return (
    <div className="p-4 md:p-6 space-y-8">
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
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertCircle className="h-6 w-6 text-amber-500" />
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Master Pegawai</h1>
          <p className="text-sm text-gray-500 font-medium italic">Data statistik dan manajemen personel terpadu</p>
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
            onClick={() => document.getElementById('import-pegawai')?.click()}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs md:text-sm"
            disabled={importing}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <input id="import-pegawai" type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />

          <Button
            onClick={() => setShowCreateDialog(true)}
            className="col-span-2 md:col-span-1 text-xs md:text-sm bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Tambah Pegawai
          </Button>
        </div>
      </div>

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
              Total Pegawai
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 w-16 bg-indigo-200 animate-pulse rounded" />
            ) : (
              <div className="text-3xl font-bold text-indigo-900">{stats?.total || 0}</div>
            )}
            <p className="text-xs text-indigo-600 mt-1">Personel aktif saat ini</p>
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
            <p className="text-xs text-rose-600 mt-1">Sebaran organisasi</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unit Distribution Chart */}
        <Card className="lg:col-span-2 border-none shadow-sm h-[400px]">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Sebaran Pegawai per Unit
            </CardTitle>
            <CardDescription>Grafik jumlah personel pada masing-masing unit kerja</CardDescription>
          </CardHeader>
          <CardContent className="h-full pb-16">
            {statsLoading ? (
              <div className="h-full w-full bg-gray-50 animate-pulse rounded-lg flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.byUnit.slice(0, 15)} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={80}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                  />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {stats?.byUnit.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Detailed Stats Side Card */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-emerald-600" />
              Detail Komposisi
            </CardTitle>
            <CardDescription>Rincian berdasarkan golongan & status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Berdasarkan Golongan</h4>
              <div className="space-y-2">
                {stats?.byGrade.slice(0, 5).map((g, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{g.name}</span>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-24 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{ width: `${(g.value / (stats?.total || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-gray-900 w-8 text-right">{g.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Berdasarkan Status</h4>
              <div className="space-y-2">
                {stats?.byStatus.slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{s.name}</span>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-24 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${(s.value / (stats?.total || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-gray-900 w-8 text-right">{s.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Daftar Pegawai</CardTitle>
          <CardDescription>
            Menampilkan {pegawai.length} dari {totalCount} pegawai
          </CardDescription>
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
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-500">
                Menampilkan {totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, totalCount)} dari {totalCount} pegawai
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
                className="h-8 text-xs px-3"
              >
                Sebelumnya
              </Button>
              <div className="flex items-center gap-1 mx-1">
                <span className="text-xs font-bold text-gray-900 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                  {currentPage}
                </span>
                <span className="text-xs text-gray-500">
                  / {totalPages}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                className="h-8 text-xs px-3"
              >
                Selanjutnya
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PegawaiFormDialog
        open={showCreateDialog}
        onClose={handleCloseDialog}
        onSuccess={handleSuccess}
        pegawai={selectedPegawai}
      />
    </div>
  )
}
