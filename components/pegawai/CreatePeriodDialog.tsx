'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createNextPeriodAction } from '@/app/(authenticated)/pegawai/actions'
import { formatPeriodToMonthName } from '@/lib/utils/format'
import type { EmployeePeriod } from '@/lib/types/database.types'
import { Calendar, Copy, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface CreatePeriodDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: (newPeriod: string) => void
  existingPeriods: EmployeePeriod[]
}

export function CreatePeriodDialog({
  open,
  onClose,
  onSuccess,
  existingPeriods
}: CreatePeriodDialogProps) {
  // Default new period to next month of latest period
  const latestPeriod = existingPeriods[0]?.period || '2026-01'
  const computeNextPeriod = (p: string) => {
    const [y, m] = p.split('-').map(Number)
    let nextM = m + 1
    let nextY = y
    if (nextM > 12) {
      nextM = 1
      nextY += 1
    }
    return `${nextY}-${String(nextM).padStart(2, '0')}`
  }

  const [period, setPeriod] = useState<string>(computeNextPeriod(latestPeriod))
  const [sourcePeriod, setSourcePeriod] = useState<string>(latestPeriod)
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!period || !period.includes('-')) {
      toast.error('Pilih bulan & tahun periode baru yang valid')
      return
    }

    // Check if period already exists
    if (existingPeriods.some(p => p.period === period)) {
      toast.error(`Periode ${formatPeriodToMonthName(period)} sudah ada. Silakan pilih dari dropdown periode.`)
      return
    }

    setLoading(true)
    try {
      const result = await createNextPeriodAction(period, sourcePeriod)
      if (result.success) {
        toast.success(`Periode ${formatPeriodToMonthName(period)} berhasil dibuat!`)
        onSuccess(period)
        onClose()
      } else {
        toast.error(result.error || 'Gagal membuat periode')
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan sistem')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-700">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Buka Periode Pegawai Baru
          </DialogTitle>
          <DialogDescription>
            Buka periode bulan berikutnya untuk mutasi atau rotasi pegawai baru.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* New Period Selection */}
          <div className="space-y-2">
            <Label htmlFor="period-month">Pilih Bulan &amp; Tahun Periode Baru</Label>
            <Input
              id="period-month"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="font-medium"
            />
            {period && (
              <p className="text-xs text-blue-600 font-semibold">
                Periode yang akan dibuka: {formatPeriodToMonthName(period)}
              </p>
            )}
          </div>

          {/* Source Period to copy from */}
          <div className="space-y-2">
            <Label htmlFor="source-period" className="flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              Salin Penempatan Pegawai Dari Periode
            </Label>
            <Select value={sourcePeriod} onValueChange={setSourcePeriod}>
              <SelectTrigger id="source-period">
                <SelectValue placeholder="Pilih periode sumber..." />
              </SelectTrigger>
              <SelectContent>
                {existingPeriods.map((p) => (
                  <SelectItem key={p.period} value={p.period}>
                    {p.period_name || formatPeriodToMonthName(p.period)} {p.is_locked ? '(Terkunci)' : '(Draf)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Seluruh penempatan unit kerja pegawai dari periode sumber akan disalin ke periode baru. Data periode sebelumnya yang telah dikunci tetap aman dan tidak akan bergeser.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !period}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Buka Periode Baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

