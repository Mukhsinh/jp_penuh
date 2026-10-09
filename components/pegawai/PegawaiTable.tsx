'use client'

import { useState, memo } from 'react'
import { activatePegawai, deactivatePegawai, deletePegawai } from '@/lib/services/pegawai.service'
import { Button } from '@/components/ui/button'
import { Edit, Ban, CheckCircle, Trash2, CheckCircle2 } from 'lucide-react'
import type { Pegawai } from '@/lib/types/database.types'

interface PegawaiTableProps {
  pegawai: Pegawai[]
  loading: boolean
  onEdit: (pegawai: Pegawai) => void
  onRefresh: () => void
}

export const PegawaiTable = memo(function PegawaiTable({ pegawai, loading, onEdit, onRefresh }: PegawaiTableProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const handleActivate = async (pegawai: Pegawai) => {
    if (!confirm(`Apakah Anda yakin ingin mengaktifkan kembali ${pegawai.full_name}?`)) {
      return
    }

    setActionLoading(pegawai.id)
    const result = await activatePegawai(pegawai.id)
    setActionLoading(null)

    if (result.success) {
      alert('Pegawai berhasil diaktifkan kembali')
      onRefresh()
    } else {
      alert(`Gagal: ${result.error}`)
    }
  }

  const handleDeactivate = async (pegawai: Pegawai) => {
    if (!confirm(`Apakah Anda yakin ingin menonaktifkan ${pegawai.full_name}?`)) {
      return
    }

    setActionLoading(pegawai.id)
    const result = await deactivatePegawai(pegawai.id)
    setActionLoading(null)

    if (result.success) {
      alert('Pegawai berhasil dinonaktifkan')
      onRefresh()
    } else {
      alert(`Gagal: ${result.error}`)
    }
  }

  const handleDelete = async (pegawai: Pegawai) => {
    if (!confirm(`PERINGATAN: Apakah Anda yakin ingin menghapus ${pegawai.full_name}?\n\nTindakan ini akan menghapus:\n- Data pegawai\n- Semua data KPI dan realisasi terkait\n\nTindakan ini TIDAK DAPAT DIBATALKAN!`)) {
      return
    }

    setActionLoading(pegawai.id)
    const result = await deletePegawai(pegawai.id)
    setActionLoading(null)

    if (result.success) {
      alert('Pegawai berhasil dihapus')
      onRefresh()
    } else {
      alert(`Gagal: ${result.error}`)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Memuat data...</p>
      </div>
    )
  }

  if (pegawai.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Tidak ada data pegawai</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50/50">
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600">Kode</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600">Nama Lengkap</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600 hidden md:table-cell">Unit</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600 hidden lg:table-cell">Jabatan</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600 hidden sm:table-cell">Status</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600 hidden xl:table-cell">Golongan</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600 hidden xl:table-cell">Pajak</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600 hidden lg:table-cell">Telepon</th>
            <th className="text-left p-3 text-xs md:text-sm font-semibold text-gray-600">Aktif</th>
            <th className="text-right p-3 text-xs md:text-sm font-semibold text-gray-600">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {pegawai.map((p) => (
            <tr key={p.id} className="border-b hover:bg-gray-50 transition-colors">
              <td className="p-3 text-xs md:text-sm font-medium text-gray-900">{p.employee_code}</td>
              <td className="p-3 text-xs md:text-sm text-gray-700">
                <div className="font-medium">{p.full_name}</div>
                <div className="text-[10px] text-gray-400 truncate max-w-[150px]">{p.email}</div>
                <div className="text-xs text-gray-400 md:hidden">{p.position || '-'}</div>
              </td>
              <td className="p-3 text-xs md:text-sm text-gray-600 hidden md:table-cell">{p.m_units?.name || '-'}</td>
              <td className="p-3 text-xs md:text-sm text-gray-600 hidden lg:table-cell">{p.position || '-'}</td>
              <td className="p-3 hidden sm:table-cell">
                <span className={`px-2 py-0.5 text-xs md:text-xs rounded-full font-medium ${p.employment_status === 'PNS' ? 'bg-purple-100 text-purple-800' :
                  p.employment_status === 'PPPK' ? 'bg-green-100 text-green-800' :
                    p.employment_status === 'PPPK PARUH WAKTU' ? 'bg-blue-100 text-blue-800' :
                      p.employment_status === 'BLUD' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                  }`}>
                  {p.employment_status || '-'}
                </span>
              </td>
              <td className="p-3 text-xs md:text-sm text-gray-600 hidden xl:table-cell">
                {p.employment_status === 'PNS' && p.pns_grade && p.pns_grade !== 'null' ? p.pns_grade : '-'}
              </td>
              <td className="p-3 hidden xl:table-cell">
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                  {p.tax_status}
                </span>
              </td>
              <td className="p-3 text-xs md:text-sm text-gray-600 hidden lg:table-cell">{p.phone || '-'}</td>
              <td className="p-3">
                {p.is_active ? (
                  <span className="flex items-center text-green-600 text-xs md:text-xs">
                    <CheckCircle className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    <span className="hidden xs:inline">Aktif</span>
                  </span>
                ) : (
                  <span className="flex items-center text-red-600 text-xs md:text-xs">
                    <Ban className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    <span className="hidden xs:inline">Nonaktif</span>
                  </span>
                )}
              </td>
              <td className="p-3 text-right">
                <div className="flex justify-end gap-1 md:gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => onEdit(p)}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {p.is_active ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      onClick={() => handleDeactivate(p)}
                      disabled={actionLoading === p.id}
                      title="Nonaktifkan"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => handleActivate(p)}
                      disabled={actionLoading === p.id}
                      title="Aktifkan Kembali"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(p)}
                    disabled={actionLoading === p.id}
                    title="Hapus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
