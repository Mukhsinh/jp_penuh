'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ClipboardCheck, Eye, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import type { AssessmentStatus } from '@/lib/types/assessment.types'

const AssessmentFormDialog = dynamic(() => import('./AssessmentFormDialog'), {
  loading: () => null,
  ssr: false
})

interface AssessmentTableProps {
  employees: AssessmentStatus[]
  period: string
  revenueType?: 'bpjs' | 'umum'
  loading: boolean
  onAssessmentComplete: () => void
}

export default function AssessmentTable({
  employees,
  period,
  revenueType = 'bpjs',
  loading,
  onAssessmentComplete
}: AssessmentTableProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<AssessmentStatus | null>(null)
  const [showAssessmentDialog, setShowAssessmentDialog] = useState(false)

  const handleAssess = (employee: AssessmentStatus) => {
    setSelectedEmployee(employee)
    setShowAssessmentDialog(true)
  }

  const handleCloseDialog = () => {
    setShowAssessmentDialog(false)
    setSelectedEmployee(null)
  }

  const handleAssessmentSaved = () => {
    toast.success('Penilaian berhasil dan tersimpan')
    onAssessmentComplete()
    handleCloseDialog()
  }

  const getStatusBadge = (status: string, completionPercentage: number) => {
    switch (status) {
      case 'Selesai':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            Selesai
          </Badge>
        )
      case 'Sebagian':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            Sebagian ({Math.round(completionPercentage)}%)
          </Badge>
        )
      case 'Belum Dinilai':
        return (
          <Badge variant="destructive">
            Belum Dinilai
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            {status}
          </Badge>
        )
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Selesai':
        return 'text-green-600'
      case 'Sebagian':
        return 'text-yellow-600'
      case 'Belum Dinilai':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-16 bg-gray-200 rounded-lg"></div>
          </div>
        ))}
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="text-center py-12">
        <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Tidak ada pegawai ditemukan
        </h3>
        <p className="text-gray-500">
          Tidak ada pegawai yang perlu dinilai untuk periode ini atau sesuai filter yang dipilih.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pegawai</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status Penilaian</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Indikator</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.employee_id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                      {employee.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {employee.full_name}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div className="font-medium">{employee.unit_name}</div>
                  </div>
                </TableCell>
                <TableCell>
                  {getStatusBadge(employee.status, employee.completion_percentage)}
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className={getStatusColor(employee.status)}>
                        {employee.assessed_indicators}/{employee.total_indicators}
                      </span>
                      <span className="text-gray-500">
                        {Math.round(employee.completion_percentage)}%
                      </span>
                    </div>
                    <Progress
                      value={employee.completion_percentage}
                      className="h-2"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-gray-600">
                    {employee.total_indicators} indikator KPI
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAssess(employee)}
                      className="gap-2"
                    >
                      {employee.status === 'Belum Dinilai' ? (
                        <>
                          <ClipboardCheck className="h-4 w-4" />
                          Nilai
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Lihat/Edit
                        </>
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Assessment Dialog */}
      {selectedEmployee && (
        <AssessmentFormDialog
          open={showAssessmentDialog}
          onClose={handleCloseDialog}
          employee={selectedEmployee}
          period={period}
          revenueType={revenueType}
          onSaved={handleAssessmentSaved}
        />
      )}
    </>
  )
}