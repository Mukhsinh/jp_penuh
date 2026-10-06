'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { X, Search, CheckCircle2, ChevronDown } from 'lucide-react'
import { type UserWithPegawai, getEmployeesForUserCreation } from '@/app/(authenticated)/users/actions'
import { cn } from '@/lib/utils'

interface UserFormDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  user?: UserWithPegawai | null
}

interface Pegawai {
  id: string
  employee_code: string
  full_name: string
  unit_id: string
  user_id?: string | null
}

interface Unit {
  id: string
  name: string
}

const roleLabels: Record<string, string> = {
  superadmin: 'Superadmin',
  unit_manager: 'Manajer Unit',
  employee: 'Pegawai Biasa'
}

export function UserFormDialog({ open, onClose, onSuccess, user }: UserFormDialogProps) {
  const [formData, setFormData] = useState({
    role: 'employee' as 'superadmin' | 'unit_manager' | 'employee',
    unit_id: '',
    password: '',
    employee_ids: [] as string[],
  })
  const [pegawaiList, setPegawaiList] = useState<Pegawai[]>([])
  const [unitList, setUnitList] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tempPassword, setTempPassword] = useState('')
  const [pegawaiSearchTerm, setPegawaiSearchTerm] = useState('')
  const [pegawaiUnitFilter, setPegawaiUnitFilter] = useState('all')

  useEffect(() => {
    if (open) {
      loadPegawai()
      loadUnits()
      if (user) {
        setFormData({
          role: user.role,
          unit_id: user.pegawai?.unit_id || '',
          password: '',
          employee_ids: user.employee_id ? [user.employee_id] : [],
        })
      } else {
        setFormData({ role: 'employee', unit_id: '', password: '', employee_ids: [] })
      }
      setError('')
      setTempPassword('')
      setPegawaiSearchTerm('')
      setPegawaiUnitFilter('all')
    }
  }, [open, user])

  const loadPegawai = async () => {
    try {
      const result = await getEmployeesForUserCreation()
      if (result.data) setPegawaiList(result.data)
      else if (result.error) setError(result.error)
    } catch (err: any) {
      setError('Gagal memuat daftar pegawai: ' + err.message)
    }
  }

  const loadUnits = async () => {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('m_units')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (data) setUnitList(data)
    } catch (err) {
      console.error('Failed to load units:', err)
    }
  }

  const filteredPegawai = useMemo(() => {
    return pegawaiList.filter(p => {
      const matchesSearch =
        p.full_name.toLowerCase().includes(pegawaiSearchTerm.toLowerCase()) ||
        p.employee_code.toLowerCase().includes(pegawaiSearchTerm.toLowerCase())
      const matchesUnit = pegawaiUnitFilter === 'all' || p.unit_id === pegawaiUnitFilter
      return matchesSearch && matchesUnit
    })
  }, [pegawaiList, pegawaiSearchTerm, pegawaiUnitFilter])

  const handleEmployeeToggle = (employeeId: string) => {
    if (user) {
      setFormData(prev => ({ ...prev, employee_ids: [employeeId] }))
      return
    }
    setFormData(prev => {
      const isSelected = prev.employee_ids.includes(employeeId)
      return {
        ...prev,
        employee_ids: isSelected
          ? prev.employee_ids.filter(id => id !== employeeId)
          : [...prev.employee_ids, employeeId]
      }
    })
  }

  const handleSubmit = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!user) {
        if (!formData.password) {
          setError('Kata sandi wajib diisi untuk pengguna baru')
          setLoading(false)
          return
        }
        if (formData.employee_ids.length === 0) {
          setError('Pilih minimal satu pegawai untuk dibuatkan akun')
          setLoading(false)
          return
        }

        let successCount = 0
        const failedEmployees: string[] = []

        for (const employeeId of formData.employee_ids) {
          const employee = pegawaiList.find(p => p.id === employeeId)
          if (!employee) continue
          const email = `${employee.employee_code.toLowerCase()}@sungaipenuh.com`
          const response = await fetch('/api/users/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: formData.password, role: formData.role, employee_id: employeeId })
          })
          const result = await response.json()
          if (result.success) successCount++
          else failedEmployees.push(employee.full_name)
        }

        if (successCount > 0) {
          setTempPassword(formData.password)
          const msg = failedEmployees.length > 0
            ? `Berhasil membuat ${successCount} akun. Gagal: ${failedEmployees.join(', ')}`
            : `Berhasil membuat ${successCount} akun baru.`
          alert(msg)
          onSuccess()
        } else {
          setError('Gagal membuat akun pengguna. Periksa apakah NIP sudah memiliki akun.')
        }
      } else {
        const response = await fetch('/api/users/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.id,
            email: user.email,
            role: formData.role,
            unit_id: formData.unit_id,
            password: formData.password || undefined,
            employee_id: formData.employee_ids[0] || null,
          })
        })
        const result = await response.json()
        if (result.success) {
          alert('Akses pengguna berhasil diperbarui')
          onSuccess()
        } else {
          setError(result.error || 'Gagal memperbarui pengguna')
        }
      }
    } catch (err: any) {
      setError('Terjadi kesalahan sistem: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      {/* flex-col + overflow yang ketat: header & footer tetap, body scroll */}
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md flex flex-col"
        style={{ maxHeight: 'min(92vh, 680px)' }}
      >
        {/* Header — tidak ikut scroll */}
        <div className="flex-none px-6 py-4 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">
            {user ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable, min-h-0 wajib agar flex child bisa menyusut */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-5 space-y-4">

            {/* Email info (edit mode) */}
            {user && (
              <p className="text-sm truncate">
                <span className="font-medium text-gray-700">{user.email}</span>
              </p>
            )}

            {/* Peran */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Peran <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full h-10 bg-white border border-gray-300 rounded-md px-3 pr-8 text-sm text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                >
                  <option value="superadmin">{roleLabels.superadmin}</option>
                  <option value="unit_manager">{roleLabels.unit_manager}</option>
                  <option value="employee">{roleLabels.employee}</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-xs text-gray-400">Pilih peran untuk menentukan hak akses pengguna</p>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Password {!user && <span className="text-red-500">*</span>}
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!user}
                placeholder={user ? 'Kosongkan jika tidak ingin mengubah' : 'Minimal 6 karakter'}
                className="h-10 border-gray-300 rounded-md text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {!user && (
                <p className="text-xs text-gray-400">Password ini akan digunakan untuk semua pegawai yang dipilih</p>
              )}
            </div>

            {/* Unit (edit mode only) */}
            {user && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Unit Penempatan</label>
                <div className="relative">
                  <select
                    value={formData.unit_id}
                    onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                    className="w-full h-10 bg-white border border-gray-300 rounded-md px-3 pr-8 text-sm text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    <option value="">-- Pilih Unit --</option>
                    {unitList.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Pilih Pegawai */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Pilih Pegawai {!user && <span className="text-red-500">*</span>}
              </label>

              {/* Search + Unit filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Cari nama atau NIP..."
                    value={pegawaiSearchTerm}
                    onChange={(e) => setPegawaiSearchTerm(e.target.value)}
                    className="h-9 pl-8 border-gray-300 rounded-md text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="relative">
                  <select
                    value={pegawaiUnitFilter}
                    onChange={(e) => setPegawaiUnitFilter(e.target.value)}
                    className="h-9 bg-white border border-gray-300 rounded-md px-3 pr-7 text-xs text-gray-600 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[110px]"
                  >
                    <option value="all">Semua Unit</option>
                    {unitList.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Employee list — tinggi tetap agar tidak mendorong footer keluar */}
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <div className="h-40 overflow-y-auto divide-y divide-gray-100">
                  {filteredPegawai.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-sm text-gray-400">Tidak ada pegawai tersedia</p>
                    </div>
                  ) : (
                    filteredPegawai.map((pegawai) => {
                      const isSelected = formData.employee_ids.includes(pegawai.id)
                      const unit = unitList.find(u => u.id === pegawai.unit_id)
                      return (
                        <label
                          key={pegawai.id}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                            isSelected ? "bg-blue-50" : "bg-white hover:bg-gray-50"
                          )}
                        >
                          <input
                            type={user ? 'radio' : 'checkbox'}
                            checked={isSelected}
                            onChange={() => handleEmployeeToggle(pegawai.id)}
                            className="w-4 h-4 accent-blue-600 flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 truncate">
                              {pegawai.employee_code} - {pegawai.full_name}
                              {unit && <span className="text-gray-500"> ({unit.name})</span>}
                            </p>
                          </div>
                          {pegawai.user_id && !isSelected && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                              Punya akun
                            </span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                {user
                  ? 'Pilih satu pegawai untuk dikaitkan dengan akun ini'
                  : formData.employee_ids.length > 0
                    ? `${formData.employee_ids.length} pegawai dipilih`
                    : 'Pilih satu atau lebih pegawai dengan peran yang sama'
                }
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Success */}
            {tempPassword && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md space-y-1">
                <p className="text-xs font-medium text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> Akun berhasil dibuat
                </p>
                <p className="text-xs text-green-600">
                  Kata sandi: <span className="font-semibold select-all">{tempPassword}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer — tidak ikut scroll, selalu terlihat */}
        <div className="flex-none px-6 py-4 border-t border-gray-200 flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 h-10 text-sm border-gray-300 text-gray-600 hover:bg-gray-50 rounded-md"
          >
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-none"
          >
            {loading ? 'Memproses...' : user ? 'Simpan' : 'Buat'}
          </Button>
        </div>

      </div>
    </div>
  )
}
