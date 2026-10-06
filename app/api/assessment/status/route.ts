import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Paginated fetch to bypass Supabase's default 1000-row limit.
 * Fetches all rows by iterating through pages.
 */
async function fetchAllRows(client: any, table: string, selectFields: string, filters: (q: any) => any, pageSize: number = 1000): Promise<any[]> {
  const allRows: any[] = []
  let page = 0
  while (true) {
    const from = page * pageSize
    const to = from + pageSize - 1
    let query = client.from(table).select(selectFields).range(from, to)
    query = filters(query)
    const { data, error } = await query
    if (error) {
      console.error(`[fetchAllRows] Error fetching ${table} page ${page}:`, error)
      break
    }
    if (data && data.length > 0) {
      allRows.push(...data)
      if (data.length < pageSize) break
      page++
    } else {
      break
    }
  }
  return allRows
}

interface AssessmentStatus {
  employee_id: string
  full_name: string
  unit_id: string
  unit_name: string
  period: string
  total_indicators: number
  assessed_indicators: number
  status: string
  completion_percentage: number
  role?: string
}

async function getAssessmentStatus(supabase: any, unitIdFilter: string | null, period: string, revenueType: string = 'bpjs'): Promise<AssessmentStatus[]> {
  let result: AssessmentStatus[] = []

  let empQuery = supabase
    .from('m_employees')
    .select(`
      id,
      full_name,
      unit_id,
      role,
      m_units!inner (
        name,
        code
      )
    `)
    .eq('is_active', true)
    .neq('role', 'superadmin')

  if (unitIdFilter && unitIdFilter !== '0') {
    empQuery = empQuery.eq('unit_id', unitIdFilter)
  }

  const { data: directEmps } = await empQuery.order('full_name')

  if (directEmps && directEmps.length > 0) {
    // Step 1: Preload kpi unit schemas and active categories
    const { data: unitsData } = await supabase.from('m_units').select('id, kpi_schema_mode')
    const unitSchemaMap = new Map((unitsData || []).map((u: any) => [u.id, u.kpi_schema_mode]))

    const { data: categoriesData } = await supabase
      .from('m_kpi_categories')
      .select('id, unit_id, revenue_type')
      .eq('is_active', true)

    // Filter categories according to the schema logic matching the assessment form
    const validCategories = (categoriesData || []).filter((c: any) => {
      const schemaMode = unitSchemaMap.get(c.unit_id)
      if (schemaMode === 'different') {
        return c.revenue_type === revenueType || c.revenue_type === 'all' || !c.revenue_type
      }
      return c.revenue_type === 'bpjs' || c.revenue_type === 'all' || !c.revenue_type
    })
    const validCategoryIds = validCategories.map((c: any) => c.id)
    const catToUnitMap = new Map(validCategories.map((c: any) => [c.id, c.unit_id]))

    let indicatorCountMap: Record<string, number> = {}
    if (validCategoryIds.length > 0) {
      const { data: validIndicators } = await supabase
        .from('m_kpi_indicators')
        .select('id, category_id')
        .eq('is_active', true)
        .in('category_id', validCategoryIds)

      validIndicators?.forEach((ind: any) => {
        const uId = catToUnitMap.get(ind.category_id) as string
        if (uId) indicatorCountMap[uId] = (indicatorCountMap[uId] || 0) + 1
      })
    }

    const existingAssessments = await fetchAllRows(
      supabase,
      't_kpi_assessments',
      'employee_id, indicator_id',
      (q: any) => q.eq('period', period).eq('revenue_type', revenueType)
    )

    const assessedCountMap: Record<string, Set<string>> = {}
    existingAssessments?.forEach((ass: any) => {
      if (!assessedCountMap[ass.employee_id]) {
        assessedCountMap[ass.employee_id] = new Set()
      }
      assessedCountMap[ass.employee_id].add(ass.indicator_id)
    })

    // BPJS fallback when viewing UMUM:
    // If an employee has no UMUM assessments (regardless of unit schema style), use BPJS data
    if (revenueType === 'umum') {
      const empsMissingUmum = directEmps
        .filter((emp: any) => {
          return !assessedCountMap[emp.id]
        })
        .map((emp: any) => emp.id)

      if (empsMissingUmum.length > 0) {
        const bpjsFallback = await fetchAllRows(
          supabase,
          't_kpi_assessments',
          'employee_id, indicator_id',
          (q: any) => q.eq('period', period).eq('revenue_type', 'bpjs').in('employee_id', empsMissingUmum)
        )
        bpjsFallback?.forEach((ass: any) => {
          if (!assessedCountMap[ass.employee_id]) {
            assessedCountMap[ass.employee_id] = new Set()
          }
          assessedCountMap[ass.employee_id].add(ass.indicator_id)
        })
      }
    }


    result = directEmps
      .filter((emp: any) =>
        (emp.m_units as any)?.code !== 'ADMIN' &&
        (emp.m_units as any)?.name !== 'SUPERADMIN'
      )
      .map((emp: any) => {
        const totalInd = indicatorCountMap[emp.unit_id] || 0
        const assessedInd = assessedCountMap[emp.id]?.size || 0
        let empStatus = 'Belum Dinilai'
        if (assessedInd > 0) {
          empStatus = (totalInd > 0 && assessedInd >= totalInd) ? 'Selesai' : 'Sebagian'
        }
        const completionPct = totalInd > 0 ? Math.round((assessedInd / totalInd) * 100) : 0

        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          unit_id: emp.unit_id,
          unit_name: (emp.m_units as any)?.name || '-',
          period: period,
          total_indicators: totalInd,
          assessed_indicators: assessedInd,
          status: empStatus,
          completion_percentage: completionPct,
          role: emp.role
        }
      })
  }

  return result
}

import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const appRole = user.app_metadata?.role
    const userRole = user.user_metadata?.role
    const email = user.email

    const isSuperAdmin =
      appRole === 'superadmin' ||
      userRole === 'superadmin' ||
      email === 'admin@sungaipenuh.com'

    // Use admin client for superadmin to bypass RLS, otherwise regular client
    const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

    // Get current user's employee record
    let { data: currentEmployee } = await fetchClient
      .from('m_employees')
      .select('id, role, unit_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!currentEmployee) {
      if (isSuperAdmin) {
        currentEmployee = {
          id: user.id,
          full_name: 'Super Administrator',
          role: 'superadmin',
          unit_id: '0'
        }
      } else {
        return NextResponse.json({ error: 'Employee record not found. Please contact admin to link your account.' }, { status: 404 })
      }
    }

    const effectiveRole = currentEmployee.role || (isSuperAdmin ? 'superadmin' : 'employee')
    const effectiveUnitId = currentEmployee.unit_id

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employee_id')
    const period = searchParams.get('period')
    const requestedUnitId = searchParams.get('unit_id')
    const revenueType = searchParams.get('revenue_type') || 'bpjs'

    if (!period) {
      return NextResponse.json({ error: 'Period is required' }, { status: 400 })
    }

    if (employeeId) {
      // Authorization check for unit managers
      if (effectiveRole === 'unit_manager') {
        const { data: targetEmployee } = await supabase
          .from('m_employees')
          .select('unit_id')
          .eq('id', employeeId)
          .single()

        if (!targetEmployee || targetEmployee.unit_id !== effectiveUnitId) {
          return NextResponse.json(
            { error: 'You can only view status for employees in your unit' },
            { status: 403 }
          )
        }
      }

      // Get status for specific employee
      const statuses = await getAssessmentStatus(fetchClient, effectiveRole === 'unit_manager' ? effectiveUnitId : null, period, revenueType)
      const employeeStatus = statuses.find(s => s.employee_id === employeeId)

      if (!employeeStatus) {
        return NextResponse.json({ error: 'Employee status not found' }, { status: 404 })
      }

      return NextResponse.json({ status: employeeStatus })
    } else {
      // Get status matching unit filter
      let unitIdFilter = effectiveRole === 'unit_manager' ? effectiveUnitId : null

      if (effectiveRole === 'superadmin' && requestedUnitId && requestedUnitId !== 'all') {
        unitIdFilter = requestedUnitId
      }

      const statuses = await getAssessmentStatus(fetchClient, unitIdFilter, period, revenueType)

      // Calculate summary statistics
      const summary = {
        total_employees: statuses.length,
        completed: statuses.filter(s => s.status === 'Selesai').length,
        started: statuses.filter(s => s.assessed_indicators > 0).length,
        partial: statuses.filter(s => s.status === 'Sebagian').length,
        not_started: statuses.filter(s => s.assessed_indicators === 0).length,
        completion_rate: statuses.length > 0
          ? Math.round((statuses.filter(s => s.status === 'Selesai').length / statuses.length) * 100)
          : 0
      }

      return NextResponse.json({
        statuses,
        summary
      })
    }
  } catch (error: any) {
    console.error('Assessment status GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assessment status' },
      { status: 500 }
    )
  }
}
