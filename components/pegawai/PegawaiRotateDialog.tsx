'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { rotateEmployeeUnitAction } from '@/app/(authenticated)/pegawai/actions'
import { toast } from 'sonner'
import { ArrowRightLeft, Building2, Loader2, User } from 'lucide-react'
import type { Pegawai } from '@/lib/types/database.types'

interface PegawaiRotateDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  pegawai: Pegawai | null
  period: string
  periodName: string
  units: Array<{ id: string; name: string }>
}

export function PegawaiRotateDialog({
  open,
  onClose,
  onSuccess,
  pegawai,
  period,
  periodName,
  units
}: PegawaiRotateDialogProps) {
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  if (!pegawai) return null

  const currentUnitName = pegawai.m_units?.name || 'Belum ada unit'

  const handleRotate = async () => {
    if (!selectedUnitId) {
      toast.error('Pilih unit kerja baru terlebih dahulu')
      return
    }

    if (selectedUnitId === pegawai.unit_id) {
      toast.error('Unit tujuan sama dengan unit saat ini')
      return
    }

    const targetUnit = units.find(u => u.id === selectedUnitId)?.name || 'Unit Baru'
    const confirmMsg = `Konfirmasi Pemindahan/Rotasi:\n\nPindahkan pegawai "${pegawai.full_name}" dari unit "${currentUnitName}" ke "${targetUnit}" untuk periode ${periodName}?\n\nPerubahan ini hanya berlaku untuk periode ${periodName} dan periode ke depan. Periode sebelumnya yang telah dikunci tidak akan terpengaruh.`

    if (!window.confirm(confirmMsg)) return

    setLoading(true)
    try {
      const result = await rotateEmployeeUnitAction(period, pegawai.id, selectedUnitId)
      if (result.success) {
        toast.success(`Berhasil memindahkan ${pegawai.full_name} ke ${targetUnit}`)
        onSuccess()
        onClose()
      } else {
        toast.error(result.error || 'Gagal memindahkan pegawai')
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
            <ArrowRightLeft className="w-5 h-5" />
            Rotasi / Mutasi Unit Kerja
          </DialogTitle>
          <DialogDescription>
            Pindahkan pegawai ke unit kerja baru pada periode <strong className="text-slate-800">{periodName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee Info Box */}
          <div className="p-3 bg-slate-50 border rounded-lg space-y-1 text-sm">
            <div className="flex items-center gap-2 text-slate-800 font-semibold">
              <User className="w-4 h-4 text-slate-500" />
              {pegawai.full_name} ({pegawai.employee_code || '-'})
            </div>
            <div className="flex items-center gap-2 text-slate-600 text-xs pl-6">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Unit Saat Ini: <strong className="text-slate-700">{currentUnitName}</strong>
            </div>
          </div>

          {/* New Unit Selection */}
          <div className="space-y-2">
            <Label htmlFor="new-unit">Pilih Unit Kerja Tujuan</Label>
            <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
              <SelectTrigger id="new-unit" className="w-full">
                <SelectValue placeholder="Pilih unit kerja baru..." />
              </SelectTrigger>
              <SelectContent>
                {units
                  .filter(u => u.id !== pegawai.unit_id)
                  .map(unit => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            onClick={handleRotate}
            disabled={loading || !selectedUnitId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Konfirmasi Mutasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

