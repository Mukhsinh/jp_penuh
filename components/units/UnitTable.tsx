'use client'

import { useState, memo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Edit, Trash2, Power, PowerOff, Plus, Download, Upload, FileSpreadsheet, FileText, Loader2, Lock } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { UnitFormDialog } from './UnitFormDialog'
import { DeleteUnitDialog } from './DeleteUnitDialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Unit {
  id: string
  code: string
  name: string
  proportion_percentage: number
  proportion_umum_percentage?: number | null
  use_same_proportion?: boolean
  is_active: boolean
  employee_count?: number
  employees?: { count: number }[]
}

interface UnitTableProps {
  units: Unit[]
  onSuccess?: () => void
  period?: string
  isLocked?: boolean
  periodName?: string
}

export const UnitTable = memo(function UnitTable({
  units,
  onSuccess,
  period,
  isLocked = false,
  periodName = ''
}: UnitTableProps) {
  const router = useRouter()
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)

  const handleAdd = () => {
    if (isLocked) {
      toast.warning(`Periode ${periodName || period} telah dikunci. Tambah unit hanya dapat dilakukan pada periode terbuka.`)
      return
    }
    setSelectedUnit(null)
    setIsFormOpen(true)
  }

  const handleEdit = (unit: Unit) => {
    setSelectedUnit(unit)
    setIsFormOpen(true)
  }

  const handleDelete = (unit: Unit) => {
    if (isLocked) {
      toast.warning(`Periode ${periodName || period} telah dikunci. Hapus unit tidak dapat dilakukan pada periode terkunci.`)
      return
    }
    setSelectedUnit(unit)
    setIsDeleteOpen(true)
  }

  const handleToggleActive = async (unit: Unit) => {
    if (isLocked) {
      toast.warning(`Periode ${periodName || period} telah dikunci. Mengubah status unit tidak dapat dilakukan pada periode terkunci.`)
      return
    }

    const toastId = toast.loading(`${unit.is_active ? 'Menonaktifkan' : 'Mengaktifkan'} unit...`)
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('m_units')
        .update({
          is_active: !unit.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', unit.id)

      if (error) throw error

      toast.success(`Unit ${unit.is_active ? 'dinonaktifkan' : 'diaktifkan'}`, { id: toastId })
      if (onSuccess) onSuccess()
      router.refresh()
    } catch (err: any) {
      console.error('Error toggling unit status:', err)
      toast.error(err.message || 'Gagal mengubah status unit', { id: toastId })
    }
  }

  const getEmployeeCount = (unit: Unit) => {
    if (unit.employee_count !== undefined) return unit.employee_count
    return unit.employees?.[0]?.count || 0
  }

  const handleDownloadTemplate = () => {
    window.open('/api/units/template', '_blank')
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      toast.warning(`Periode ${periodName || period} telah dikunci. Import porsi unit hanya dapat dilakukan pada periode terbuka.`)
      if (event.target) event.target.value = ''
      return
    }

    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    if (period) {
      formData.append('period', period)
    }

    setIsImporting(true)
    setImportProgress(10)
    const toastId = toast.loading('Menyiapkan data import...')

    let currentProgress = 10
    const progressInterval = setInterval(() => {
      currentProgress += (90 - currentProgress) * 0.1
      setImportProgress(Math.round(currentProgress))
    }, 400)

    try {
      setImportProgress(20)
      toast.loading('Mengunggah file dan memvalidasi...', { id: toastId })

      const response = await fetch('/api/units/import', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      clearInterval(progressInterval)
      setImportProgress(100)

      if (!response.ok) {
        throw new Error(result.error || 'Gagal mengimport data')
      }

      if (result.success > 0 || result.failed === 0) {
        toast.success(
          `Import berhasil!`,
          {
            id: toastId,
            duration: 5000,
            description: `${result.success} unit berhasil diproses.${result.failed > 0 ? ` (${result.failed} gagal)` : ''}. Data pegawai otomatis disinkronkan.`,
          }
        )

        if (onSuccess) onSuccess()
        router.refresh()
      } else {
        toast.error(`Import gagal. Semua data (${result.failed} unit) gagal diproses.`, { id: toastId })
      }

      if (result.errors && result.errors.length > 0) {
        console.error('Import detail errors:', result.errors)
      }

      setTimeout(() => {
        setIsImporting(false)
        setImportProgress(0)
      }, 2000)

    } catch (error: any) {
      clearInterval(progressInterval)
      console.error('Import error:', error)
      toast.error(error.message || 'Terjadi kesalahan saat import', { id: toastId })
      setIsImporting(false)
      setImportProgress(0)
    } finally {
      event.target.value = ''
    }
  }

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    const periodParam = period ? `&period=${period}` : ''
    window.open(`/api/units/export?format=${format}${periodParam}`, '_blank')
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            onClick={handleDownloadTemplate}
            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
            disabled={isImporting}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Template
          </Button>

          <Button
            onClick={() => {
              if (isLocked) {
                toast.warning(`Periode ${periodName || period} telah dikunci. Buka kunci terlebih dahulu jika ingin mengimport porsi unit.`)
                return
              }
              document.getElementById('import-units')?.click()
            }}
            className="flex-1 sm:flex-none bg-amber-600 hover:bg-amber-700 text-white text-xs h-9"
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isImporting ? 'Importing...' : 'Import'}
          </Button>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={() => handleDownloadReport('excel')}
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none h-9"
              disabled={isImporting}
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-green-600" />
              Excel
            </Button>

            <Button
              onClick={() => handleDownloadReport('pdf')}
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none h-9"
              disabled={isImporting}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5 text-red-600" />
              PDF
            </Button>
          </div>
        </div>

        <Button
          onClick={handleAdd}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          disabled={isImporting}
        >
          <Plus className="mr-2 h-4 w-4" />
          Tambah Unit
        </Button>
      </div>

      {isImporting && (
        <div className="mb-6 p-5 border-2 rounded-xl bg-blue-50/30 border-blue-100 shadow-sm animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-sm font-semibold text-blue-900 tracking-tight">Memproses Import Data Unit...</span>
            </div>
            <span className="text-sm font-bold text-blue-700 bg-blue-100/50 px-2 py-0.5 rounded text-mono">{importProgress}%</span>
          </div>
          <Progress value={importProgress} className="h-2.5 bg-blue-100" />
          <div className="flex justify-between mt-2.5">
            <p className="text-[11px] text-blue-600/80 italic font-medium">Mohon tunggu, jangan tutup atau refresh halaman...</p>
            <p className="text-[11px] text-blue-600/80 font-semibold uppercase tracking-wider">{importProgress === 100 ? 'Selesai' : 'Sedang Bekerja'}</p>
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="w-[100px]">Kode</TableHead>
              <TableHead>Nama Unit</TableHead>
              <TableHead className="hidden md:table-cell">Proporsi BPJS</TableHead>
              <TableHead className="hidden md:table-cell">Proporsi UMUM</TableHead>
              <TableHead className="hidden sm:table-cell">Pegawai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500">
                  Tidak ada unit ditemukan
                </TableCell>
              </TableRow>
            ) : (
              units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">{unit.code}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{unit.name}</TableCell>
                  <TableCell className="hidden md:table-cell font-semibold text-blue-700">
                    {(Number(unit.proportion_percentage) || 0).toFixed(2)}%
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-semibold text-slate-700">
                    {unit.use_same_proportion !== false ? (
                      <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-100">
                        Sama BPJS ({(Number(unit.proportion_percentage) || 0).toFixed(2)}%)
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        {(Number(unit.proportion_umum_percentage ?? unit.proportion_percentage) || 0).toFixed(2)}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                      {getEmployeeCount(unit)} org
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${unit.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {unit.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${isLocked ? 'text-slate-500 hover:text-slate-700' : 'text-blue-600'}`}
                        onClick={() => handleEdit(unit)}
                        title={isLocked ? 'Lihat Detail Proporsi (Terkunci)' : 'Ubah Proporsi'}
                      >
                        {isLocked ? <Lock className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${unit.is_active ? 'text-amber-600' : 'text-emerald-600'}`}
                        onClick={() => handleToggleActive(unit)}
                        disabled={isLocked}
                        title={isLocked ? 'Terkunci' : unit.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {unit.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => handleDelete(unit)}
                        disabled={isLocked || getEmployeeCount(unit) > 0}
                        title={isLocked ? 'Terkunci' : getEmployeeCount(unit) > 0 ? 'Tidak dapat dihapus karena ada pegawai' : 'Hapus Unit'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UnitFormDialog
        unit={selectedUnit}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        period={period}
        isLocked={isLocked}
        periodName={periodName}
        onSuccess={onSuccess}
      />

      <DeleteUnitDialog
        unit={selectedUnit}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      />

      <input
        type="file"
        id="import-units"
        className="hidden"
        accept=".xlsx, .xls"
        onChange={handleImport}
      />
    </>
  )
})
