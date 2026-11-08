'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createNextUnitPeriodAction } from '@/app/(authenticated)/units/actions'
import { formatPeriodToMonthName } from '@/lib/utils/format'
import type { UnitPeriod } from '@/lib/types/database.types'
import { Calendar, Copy, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface CreateUnitPeriodDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: (newPeriod: string) => void
  existingPeriods: UnitPeriod[]
}

export function CreateUnitPeriodDialog({
  open,
  onClose,
  onSuccess,
  existingPeriods
}: CreateUnitPeriodDialogProps) {
  const latestPeriod = existingPeriods[0]?.period || '2026-01'
  const computeNextPeriod = (p: string) => {
    const [y, m] = p.split('-').map(Number)
    let nextM = (m || 1) + 1
    let nextY = y || 2026
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

    if (existingPeriods.some(p => p.period === period)) {
      toast.error(`Periode ${formatPeriodToMonthName(period)} sudah ada. Silakan pilih dari dropdown periode.`)
      return
    }

    setLoading(true)
    try {
      const result = await createNextUnitPeriodAction(period, sourcePeriod)
      if (result.success) {
        toast.success(`Periode ${formatPeriodToMonthName(period)} berhasil dibuat!`)
        onSuccess(period)
        onClose()
      } else {
        toast.error(result.error || 'Gagal membuat periode unit baru')
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
          <DialogTitle className="flex items-center gap-2 text-indigo-700">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            Buka Periode Proporsi Unit Baru
          </DialogTitle>
          <DialogDescription>
            Buka periode bulan berikutnya untuk penyesuaian porsi persentase unit kerja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* New Period Selection */}
          <div className="space-y-2">
            <Label htmlFor="unit-period-month">Pilih Bulan &amp; Tahun Periode Baru</Label>
            <Input
              id="unit-period-month"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="font-medium"
            />
            {period && (
              <p className="text-xs text-indigo-600 font-semibold">
                Periode yang akan dibuka: {formatPeriodToMonthName(period)}
              </p>
            )}
          </div>

          {/* Source Period to copy from */}
          <div className="space-y-2">
            <Label htmlFor="source-unit-period" className="flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              Salin Porsi Proporsi Dari Periode
            </Label>
            <Select value={sourcePeriod} onValueChange={setSourcePeriod}>
              <SelectTrigger id="source-unit-period">
                <SelectValue placeholder="Pilih periode sumber..." />
              </SelectTrigger>
              <SelectContent>
                {existingPeriods.map((p) => (
                  <SelectItem key={p.period} value={p.period}>
                    {p.period_name || formatPeriodToMonthName(p.period)} {p.is_locked ? '🔒 (Terkunci)' : '🔓 (Draf)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Seluruh porsi persentase (BPJS &amp; UMUM) unit kerja dari periode sumber akan disalin ke periode baru sebagai draf awal. Periode yang telah dikunci sebelumnya tidak akan terpengaruh sama sekali.
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Buka Periode Baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

