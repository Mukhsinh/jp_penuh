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

import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use admin client to bypass RLS for employee lookup
    const adminClient = await createAdminClient()

    // Try by user_id first
    let currentEmployee: any = null
    const { data: byUserId } = await adminClient
      .from('m_employees')
      .select('id, role, unit_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (byUserId) {
      currentEmployee = byUserId
    } else {
      const appRole = user.app_metadata?.role
      const userRole = user.user_metadata?.role
      const email = user.email

      const isSuperAdmin =
        appRole === 'superadmin' ||
        userRole === 'superadmin' ||
        email === 'admin@sungaipenuh.com'

      if (isSuperAdmin) {
        currentEmployee = {
          id: user.id,
          full_name: 'Super Administrator',
          role: 'superadmin',
          unit_id: '0'
        }
      } else {
        console.error('No employee record linked to user id:', user.id)
        return NextResponse.json({ error: 'Employee record not found. Please contact admin to link your account.' }, { status: 404 })
      }
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')
    const status = searchParams.get('status')
    const requestedUnitId = searchParams.get('unit_id')

    if (!period) {
      return NextResponse.json({ error: 'Period is required' }, { status: 400 })
    }

    // STUCT UNIT ISOLATION & FILTERING
    const userRole = currentEmployee.role
    const userUnitId = currentEmployee.unit_id

    const revenueType = searchParams.get('revenue_type') || 'bpjs'
    let employeesData: AssessmentStatus[] = []

    // 1. Get SUPERADMIN unit IDs to exclude
    const { data: rawUnits } = await adminClient
      .from('m_units')
      .select('id, code, name')

    const adminUnitIds = (rawUnits || [])
      .filter((u: any) => {
        const code = String(u.code || '').toUpperCase()
        const name = String(u.name || '').toUpperCase()
        return code === 'ADMIN' || code === 'SUPERADMIN' || name.includes('SUPERADMIN')
      })
      .map((u: any) => u.id)

    let empQuery = adminClient
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

    // Exclude SUPERADMIN unit
    if (adminUnitIds.length > 0) {
      empQuery = empQuery.not('unit_id', 'in', `(${adminUnitIds.join(',')})`)
    }

    if (userRole === 'unit_manager' && userUnitId) {
      empQuery = empQuery.eq('unit_id', userUnitId)
    } else if (userRole === 'superadmin' && requestedUnitId && requestedUnitId !== 'all') {
      empQuery = empQuery.eq('unit_id', requestedUnitId)
    }

    const { data: directEmps, error: directErr } = await empQuery.order('full_name')

    if (!directErr && directEmps) {
      // Step 1: Preload kpi unit schemas and active categories
      const { data: unitsData } = await adminClient.from('m_units').select('id, kpi_schema_mode')
      const unitSchemaMap = new Map((unitsData || []).map(u => [u.id, u.kpi_schema_mode]))

      const { data: categoriesData } = await adminClient
        .from('m_kpi_categories')
        .select('id, unit_id, revenue_type')
        .eq('is_active', true)

      // Filter categories according to the schema logic matching the assessment form
      const validCategories = (categoriesData || []).filter(c => {
        const schemaMode = unitSchemaMap.get(c.unit_id)
        if (schemaMode === 'different') {
          return c.revenue_type === revenueType || c.revenue_type === 'all' || !c.revenue_type
        }
        return c.revenue_type === 'bpjs' || c.revenue_type === 'all' || !c.revenue_type
      })
      const validCategoryIds = validCategories.map(c => c.id)
      const catToUnitMap = new Map(validCategories.map(c => [c.id, c.unit_id]))

      let indicatorCountMap: Record<string, number> = {}
      if (validCategoryIds.length > 0) {
        const { data: validIndicators } = await adminClient
          .from('m_kpi_indicators')
          .select('id, category_id')
          .eq('is_active', true)
          .in('category_id', validCategoryIds)

        validIndicators?.forEach((ind: any) => {
          const uId = catToUnitMap.get(ind.category_id) as string
          if (uId) indicatorCountMap[uId] = (indicatorCountMap[uId] || 0) + 1
        })
      }

      // Get existing assessments for this period and revenue_type (paginated to handle >1000 rows)
      const existingAssessments = await fetchAllRows(
        adminClient,
        't_kpi_assessments',
        'employee_id, indicator_id',
        (q: any) => q.eq('period', period).or(`revenue_type.eq.${revenueType},revenue_type.is.null`)
      )

      const assessedCountMap: Record<string, Set<string>> = {}
      existingAssessments?.forEach((ass: any) => {
        if (!assessedCountMap[ass.employee_id]) {
          assessedCountMap[ass.employee_id] = new Set()
        }
        assessedCountMap[ass.employee_id].add(ass.indicator_id)
      })

      // BPJS fallback for same-schema units when viewing UMUM:
      // If an employee in a 'same' schema unit has no UMUM assessments, use BPJS data
      if (revenueType === 'umum') {
        const empsMissingUmum = directEmps
          .filter((emp: any) => {
            const schemaMode = unitSchemaMap.get(emp.unit_id)
            return schemaMode !== 'different' && !assessedCountMap[emp.id]
          })
          .map((emp: any) => emp.id)

        if (empsMissingUmum.length > 0) {
          const bpjsFallback = await fetchAllRows(
            adminClient,
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


      employeesData = directEmps.map((emp: any) => {
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

      if (status && ['Belum Dinilai', 'Sebagian', 'Selesai'].includes(status)) {
        employeesData = employeesData.filter(e => e.status === status)
      }
    }

    // Secondary filter: Exclude superadmins AND employees from SUPERADMIN unit
    const { data: adminUnitInfo } = await adminClient
      .from('m_units')
      .select('id, name')
      .or('code.ilike.ADMIN,name.ilike.SUPERADMIN')
      .maybeSingle()

    const filteredResults = employeesData.filter((emp: any) => {
      if (emp.role === 'superadmin') return false
      // Exclude SUPERADMIN unit by id or name
      if (adminUnitInfo && emp.unit_id === adminUnitInfo.id) return false
      if (emp.unit_name?.toUpperCase() === 'SUPERADMIN') return false
      if (userRole === 'unit_manager' && emp.unit_id !== userUnitId) {
        return false
      }
      return true
    })

    return NextResponse.json({ employees: filteredResults })
  } catch (error) {
    console.error('Assessment employees GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch employees for assessment' },
      { status: 500 }
    )
  }
}