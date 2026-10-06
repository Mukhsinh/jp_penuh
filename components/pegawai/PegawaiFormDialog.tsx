'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createPegawai, updatePegawai } from '@/app/(authenticated)/pegawai/actions'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { Pegawai } from '@/lib/types/database.types'

interface PegawaiFormDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  pegawai?: Pegawai | null
}

interface Unit {
  id: string
  name: string
}

export function PegawaiFormDialog({ open, onClose, onSuccess, pegawai }: PegawaiFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [units, setUnits] = useState<Unit[]>([])
  const [formData, setFormData] = useState({
    employee_code: '',
    full_name: '',
    email: '',
    unit_id: '',
    tax_status: 'TK/0',
    employment_status: 'PNS' as 'PNS' | 'PPPK' | 'PPPK PARUH WAKTU' | 'BLUD',
    pns_grade: '' as string | number,
    position: '',
    phone: '',
    nik: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_name: '',
  })

  // Load units
  useEffect(() => {
    const loadUnits = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('m_units')
        .select('id, name')
        .eq('is_active', true)
        .order('name')

      if (data) {
        setUnits(data)
      }
    }

    if (open) {
      loadUnits()
    }
  }, [open])

  // Populate form when editing
  useEffect(() => {
    if (pegawai) {
      setFormData({
        employee_code: pegawai.employee_code,
        full_name: pegawai.full_name,
        email: pegawai.email || '',
        unit_id: pegawai.unit_id,
        tax_status: pegawai.tax_status || 'TK/0',
        employment_status: pegawai.employment_status || (pegawai.employee_status as any === 'active' ? 'ASN' : (pegawai.employee_status as any || 'ASN')),
        pns_grade: pegawai.pns_grade ? String(pegawai.pns_grade) : '',
        position: pegawai.position || '',
        phone: pegawai.phone || '',
        nik: pegawai.nik || '',
        bank_name: pegawai.bank_name || '',
        bank_account_number: pegawai.bank_account_number || '',
        bank_account_name: pegawai.bank_account_name || '',
      })
    } else {
      setFormData({
        employee_code: '',
        full_name: '',
        email: '',
        unit_id: '',
        tax_status: 'TK/0',
        employment_status: 'PNS',
        pns_grade: '',
        position: '',
        phone: '',
        nik: '',
        bank_name: '',
        bank_account_number: '',
        bank_account_name: '',
      })
    }
  }, [pegawai, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.employee_code || !formData.full_name || !formData.unit_id) {
      alert('Kode pegawai, nama lengkap, dan unit wajib diisi')
      return
    }

    setLoading(true)

    let result
    if (pegawai) {
      // Update existing pegawai
      result = await updatePegawai(pegawai.id, formData as any)
    } else {
      // Create new pegawai
      result = await createPegawai(formData as any)
    }

    setLoading(false)

    if (result.success) {
      alert(pegawai ? 'Pegawai berhasil diperbarui' : 'Pegawai berhasil ditambahkan')
      onSuccess()
    } else {
      alert(`Gagal: ${result.error}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] md:w-full max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{pegawai ? 'Ubah Pegawai' : 'Tambah Pegawai'}</DialogTitle>
          <DialogDescription>
            {pegawai ? 'Perbarui informasi pegawai' : 'Tambahkan pegawai baru ke sistem'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 pt-2 pb-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employee_code">Kode Pegawai *</Label>
              <Input
                id="employee_code"
                value={formData.employee_code}
                onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                placeholder="Contoh: PEG001"
                disabled={loading || !!pegawai}
                required
                className="bg-gray-50/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Nama Lengkap *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Nama lengkap pegawai"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email (Opsional)</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@sungaipenuh.com"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit_id">Unit *</Label>
              <select
                id="unit_id"
                value={formData.unit_id}
                onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                disabled={loading}
                required
              >
                <option value="">Pilih Unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employment_status">Status Kepegawaian *</Label>
              <Select
                value={formData.employment_status || ''}
                onValueChange={(value) => {
                  setFormData(prev => ({
                    ...prev,
                    employment_status: value as any,
                    pns_grade: value === 'PNS' ? (prev.pns_grade || '3') : ''
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PNS">PNS</SelectItem>
                  <SelectItem value="PPPK">PPPK</SelectItem>
                  <SelectItem value="PPPK PARUH WAKTU">PPPK PARUH WAKTU</SelectItem>
                  <SelectItem value="BLUD">BLUD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_status">Status Pajak (PTKP) *</Label>
              <Select
                value={formData.tax_status || ''}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tax_status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Status Pajak" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TK/0">TK/0</SelectItem>
                  <SelectItem value="TK/1">TK/1</SelectItem>
                  <SelectItem value="TK/2">TK/2</SelectItem>
                  <SelectItem value="TK/3">TK/3</SelectItem>
                  <SelectItem value="K/0">K/0</SelectItem>
                  <SelectItem value="K/1">K/1</SelectItem>
                  <SelectItem value="K/2">K/2</SelectItem>
                  <SelectItem value="K/3">K/3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formData.employment_status === 'PNS' && (
              <div className="space-y-2">
                <Label htmlFor="pns_grade">Golongan PNS</Label>
                <Select
                  value={String(formData.pns_grade || '')}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, pns_grade: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Golongan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-">-</SelectItem>
                    <SelectItem value="2">Golongan 2</SelectItem>
                    <SelectItem value="3">Golongan 3</SelectItem>
                    <SelectItem value="4">Golongan 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="position">Jabatan</Label>
              <Input
                id="position"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                placeholder="Jabatan pegawai"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nik">NIK</Label>
              <Input
                id="nik"
                value={formData.nik}
                onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                placeholder="Nomor Induk Kependudukan"
                disabled={loading}
                maxLength={16}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telepon</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Nomor telepon"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bank_name">Nama Bank</Label>
              <Input
                id="bank_name"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                placeholder="Contoh: BCA, Mandiri"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank_account_number">Nomor Rekening</Label>
              <Input
                id="bank_account_number"
                value={formData.bank_account_number}
                onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                placeholder="Nomor rekening bank"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bank_account_name">Nama Pemegang Rekening</Label>
              <Input
                id="bank_account_name"
                value={formData.bank_account_name}
                onChange={(e) => setFormData({ ...formData, bank_account_name: e.target.value })}
                placeholder="Nama sesuai rekening bank"
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-4 px-6 pb-6 mt-0 -mx-6 bg-gray-50/50 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-auto">
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                pegawai ? 'Perbarui' : 'Simpan'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
