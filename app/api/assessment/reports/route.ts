import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isMedicalUnit, isPartialEligibleUnit } from '@/lib/utils/medical-unit'
import { calculateCategoryScore, calculateTotalScore } from '@/lib/utils/score-calculator'

async function getUserEmployee(adminClient: any, user: any) {
  const isSuperAdmin =
    user.app_metadata?.role === 'superadmin' ||
    user.user_metadata?.role === 'superadmin' ||
    user.role === 'superadmin' ||
    user.email === 'admin@sungaipenuh.com'

  const { data: emp } = await adminClient
    .from('m_employees')
    .select('id, role, unit_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (emp) {
    if (isSuperAdmin || emp.role === 'superadmin' || emp.role === 'admin') {
      return { ...emp, role: 'superadmin' }
    }
    return emp
  }

  if (user.email) {
    const { data: byEmail } = await adminClient
      .from('m_employees')
      .select('id, role, unit_id')
      .eq('email', user.email)
      .maybeSingle()

    if (byEmail) {
      if (isSuperAdmin || byEmail.role === 'superadmin' || byEmail.role === 'admin') {
        return { ...byEmail, role: 'superadmin' }
      }
      return byEmail
    }
  }

  if (isSuperAdmin) {
    return { id: user.id, role: 'superadmin', unit_id: '0' }
  }

  return null
}

import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const period = searchParams.get('period')
    const unitId = searchParams.get('unit_id')
    const revenueType = searchParams.get('revenue_type') || 'bpjs'

    // Check authentication
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const currentEmp = await getUserEmployee(adminClient, user)

    switch (action) {
      case 'periods':
        return await getAvailablePeriods(adminClient)

      case 'units':
        return await getAvailableUnits(adminClient, currentEmp)

      case 'report':
        if (!period) {
          return NextResponse.json({ success: false, error: 'Period is required' }, { status: 400 })
        }
        return await getAssessmentReport(adminClient, currentEmp, period, unitId, revenueType)

      case 'comparison':
        if (!period) {
          return NextResponse.json({ success: false, error: 'Period is required' }, { status: 400 })
        }
        return await getPeriodComparison(adminClient, currentEmp, period, unitId, revenueType)

      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Assessment reports API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

async function getAvailablePeriods(supabase: any) {
  // Query periods from t_employee_periods first to prioritize locked and active employee periods
  const { data: empPeriods } = await supabase
    .from('t_employee_periods')
    .select('period')
    .order('period', { ascending: false })

  const { data: poolPeriods } = await supabase
    .from('t_pool')
    .select('period')
    .order('period', { ascending: false })

  const periodSet = new Set<string>()
  ;(empPeriods || []).forEach((item: any) => {
    if (item.period) periodSet.add(item.period)
  })
  ;(poolPeriods || []).forEach((item: any) => {
    if (item.period) periodSet.add(item.period)
  })

  // Return sorted periods descending
  const periods = Array.from(periodSet).sort((a, b) => b.localeCompare(a))
  return NextResponse.json({ success: true, periods })
}

async function getAvailableUnits(supabase: any, currentEmp: any) {
  const userRole = currentEmp?.role
  const userUnitId = currentEmp?.unit_id

  let query = supabase
    .from('m_units')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  // Unit Manager can only see their own unit
  if (userRole === 'unit_manager' && userUnitId && userUnitId !== 'all') {
    query = query.eq('id', userUnitId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Exclude SUPERADMIN unit from assessment
  const filteredUnits = (data || [])
    .filter((u: any) => u.code?.toUpperCase() !== 'ADMIN' && u.name?.toUpperCase() !== 'SUPERADMIN')
    .map(({ id, name }: any) => ({ id, name }))

  return NextResponse.json({ success: true, units: filteredUnits })
}

async function batchedIn(
  supabase: any,
  table: string,
  selectFields: string,
  filterColumn: string,
  filterValues: string[],
  additionalFilters?: (q: any) => any,
  batchSize: number = 20
): Promise<any[]> {
  if (filterValues.length === 0) return []
  const results: any[] = []
  const pageSize = 1000

  for (let i = 0; i < filterValues.length; i += batchSize) {
    const batch = filterValues.slice(i, i + batchSize)
    let page = 0
    let hasMore = true

    while (hasMore) {
      const from = page * pageSize
      const to = from + pageSize - 1

      let query = supabase.from(table).select(selectFields).in(filterColumn, batch).range(from, to)
      if (additionalFilters) query = additionalFilters(query)

      const { data, error } = await query
      if (error) throw error

      if (data && data.length > 0) {
        results.push(...data)
        if (data.length < pageSize) {
          hasMore = false
        } else {
          page++
        }
      } else {
        hasMore = false
      }
    }
  }

  return results
}

async function getAssessmentReport(supabase: any, currentEmp: any, period: string, unitId?: string | null, revenueType: string = 'bpjs') {
  const userRole = currentEmp?.role
  const userUnitId = currentEmp?.unit_id

  // Enforce unit isolation: unit managers can strictly query their own unit only
  let effectiveUnitId = (userRole === 'unit_manager' && userUnitId) ? userUnitId : unitId

  // Check if snapshot exists for period
  const { count: snapCount } = await supabase
    .from('t_employee_period_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('period', period)

  const useSnapshot = Boolean(snapCount && snapCount > 0)

  // If unit manager and snapshot exists, resolve manager's assigned unit in that snapshot
  if (useSnapshot && userRole === 'unit_manager' && currentEmp?.id) {
    const { data: snapManager } = await supabase
      .from('t_employee_period_snapshots')
      .select('unit_id')
      .eq('period', period)
      .eq('employee_id', currentEmp.id)
      .maybeSingle()
    if (snapManager?.unit_id) {
      effectiveUnitId = snapManager.unit_id
    }
  }

  // Build base query for employees strictly matching period snapshots
  let employeeQuery = useSnapshot
    ? supabase
        .from('t_employee_period_snapshots')
        .select('employee_id, full_name, unit_id, is_active, m_units(id, name, code)')
        .eq('period', period)
        .eq('is_active', true)
        .neq('role', 'superadmin')
    : supabase
        .from('m_employees')
        .select('id, full_name, unit_id, is_active, m_units(id, name, code)')
        .eq('is_active', true)
        .neq('role', 'superadmin')

  // Apply unit filtering
  if (effectiveUnitId && effectiveUnitId !== 'all') {
    employeeQuery = employeeQuery.eq('unit_id', effectiveUnitId)
  }

  const { data: rawEmployeesData, error: employeeError } = await employeeQuery

  if (employeeError) {
    return NextResponse.json({ success: false, error: employeeError.message }, { status: 500 })
  }

  // Filter out superadmin role AND superadmin unit employees
  const validEmployees = (rawEmployeesData || []).filter((item: any) => {
    if (item.role === 'superadmin') return false
    if (item.is_active === false) return false
    const unit = Array.isArray(item.m_units) ? item.m_units[0] : item.m_units
    const code = String(unit?.code || '').toUpperCase()
    const name = String(unit?.name || '').toUpperCase()
    if (code === 'ADMIN' || code === 'SUPERADMIN' || name.includes('SUPERADMIN')) return false
    return true
  })

  const employeesData = validEmployees.map((e: any) => ({
    ...e,
    id: useSnapshot ? e.employee_id : e.id
  }))

  if (!employeesData || employeesData.length === 0) {
    return NextResponse.json({
      success: true,
      report: {
        period,
        unit_id: unitId,
        unit_name: null,
        total_employees: 0,
        assessed_employees: 0,
        completion_rate: 0,
        average_score: 0,
        category_breakdown: { p1_average: 0, p2_average: 0, p3_average: 0 },
        status_distribution: { completed: 0, partial: 0, not_started: 0 },
        top_performers: [],
        improvement_areas: []
      }
    })
  }

  // Get KPI indicators count per unit
  const { data: indicatorsData } = await supabase
    .from('m_kpi_indicators')
    .select('id, category_id, m_kpi_categories(unit_id)')
    .eq('is_active', true)

  const indicatorsCountByUnit = (indicatorsData || []).reduce((acc: any, curr: any) => {
    const uId = curr.m_kpi_categories?.unit_id
    if (uId) acc[uId] = (acc[uId] || 0) + 1
    return acc
  }, {})

  // Get assessments for current period
  const { data: assessmentsCountData } = await supabase
    .from('t_kpi_assessments')
    .select('employee_id, indicator_id')
    .eq('period', period)
    .or(`revenue_type.eq.${revenueType},revenue_type.is.null`)
    .is('sub_indicator_id', null)

  const assessmentsCountByEmployee = (assessmentsCountData || []).reduce((acc: any, curr: any) => {
    acc[curr.employee_id] = (acc[curr.employee_id] || 0) + 1
    return acc
  }, {})

  // Calculate status summary
  let assessedEmployees = 0
  let completedEmployees = 0
  let partialEmployees = 0
  let notStartedEmployees = 0

  employeesData.forEach((emp: any) => {
    const total = indicatorsCountByUnit[emp.unit_id] || 0
    const assessed = assessmentsCountByEmployee[emp.id] || 0

    if (assessed > 0) {
      assessedEmployees++
      if (assessed >= total) {
        completedEmployees++
      } else {
        partialEmployees++
      }
    } else {
      notStartedEmployees++
    }
  })

  const totalEmployees = employeesData.length
  const completionRate = totalEmployees > 0 ? (completedEmployees / totalEmployees) * 100 : 0

  const empIds = employeesData.map((e: any) => e.id)

  // Pre-fetch sub-assessments aggregate using batchedIn to guarantee zero pagination truncation
  const rawSubData = await batchedIn(
    supabase,
    't_kpi_assessments',
    `id, employee_id, indicator_id, sub_indicator_id, score, realization_value, updated_at, created_at, m_kpi_sub_indicators (id, indicator_id, measurement_type, base_index_value, weight_percentage)`,
    'employee_id',
    empIds,
    q => q.eq('period', period).or(`revenue_type.eq.${revenueType},revenue_type.is.null`).not('sub_indicator_id', 'is', null)
  )

  // Deduplicate sub-assessments by employee_id + indicator_id + sub_indicator_id
  const uniqueSubMap = new Map<string, any>()
  for (const s of rawSubData || []) {
    if (s.m_kpi_sub_indicators?.indicator_id && s.m_kpi_sub_indicators.indicator_id !== s.indicator_id) {
      continue
    }
    const key = `${s.employee_id}:${s.indicator_id}:${s.sub_indicator_id}`
    const existing = uniqueSubMap.get(key)
    if (!existing) {
      uniqueSubMap.set(key, s)
    } else {
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime()
      const newTime = new Date(s.updated_at || s.created_at || 0).getTime()
      if (newTime > existingTime) {
        uniqueSubMap.set(key, s)
      }
    }
  }

  const subAggMap = new Map<string, number>()
  for (const s of Array.from(uniqueSubMap.values())) {
    const key = `${s.employee_id}:${s.indicator_id}`
    const isQuant = s.m_kpi_sub_indicators?.measurement_type === 'quantitative'
    let effectiveScore = Number(s.score || 0)

    if (isQuant) {
      const tariff = Number(s.m_kpi_sub_indicators?.base_index_value || 1)
      const realScore = Number(s.realization_value || 0) * tariff
      if (Math.abs(realScore) > 0 && effectiveScore !== realScore && (Math.abs(tariff) > 1 || (tariff > 0 && Math.abs(tariff - 1) > 0.00001))) {
        effectiveScore = realScore
      }
      if (effectiveScore === 0 && Math.abs(realScore) > 0) {
        effectiveScore = realScore
      }
    } else {
      if (effectiveScore === 0 && Number(s.realization_value) > 0) {
        const subWeight = Number(s.m_kpi_sub_indicators?.weight_percentage || 100)
        effectiveScore = Number(s.realization_value) * (subWeight / 100)
      }
    }

    subAggMap.set(key, (subAggMap.get(key) || 0) + effectiveScore)
  }

  // Get detailed assessment data for score calculations with inner join (MAIN rows only) using batchedIn
  const assessmentData = await batchedIn(
    supabase,
    't_kpi_assessments',
    `*, m_employees!inner!employee_id (full_name, role, unit_id, m_units!unit_id (name)), m_kpi_indicators!inner!indicator_id (name, calculation_method, m_kpi_categories!inner!category_id (category))`,
    'employee_id',
    empIds,
    q => q.eq('period', period).or(`revenue_type.eq.${revenueType},revenue_type.is.null`).is('sub_indicator_id', null)
  )

  // Create snapshot-aware metadata map for employee name and unit name
  const empMetaMap = new Map(
    employeesData.map((e: any) => [
      e.id,
      {
        name: e.full_name,
        unit_name: (Array.isArray(e.m_units) ? e.m_units[0]?.name : e.m_units?.name) || 'N/A'
      }
    ])
  )

  // Calculate category averages
  const employeeScores = new Map()
  const indicatorAchievements = new Map()

  assessmentData?.forEach((assessment: any) => {
    const category = assessment.m_kpi_indicators?.m_kpi_categories?.category?.toLowerCase() || ''
    const subSum = subAggMap.get(`${assessment.employee_id}:${assessment.indicator_id}`)
    let score = subSum !== undefined ? subSum : (Number(assessment.score) || 0)
    if (score === 0 && Number(assessment.realization_value) > 0) {
      score = Number(assessment.realization_value)
    }
    const achievement = assessment.achievement_percentage || 0
    const employeeId = assessment.employee_id
    const indicatorName = assessment.m_kpi_indicators?.name || '-'

    const isPriority = assessment.m_kpi_indicators?.calculation_method === 'priority'

    // Collect employee total scores (respecting period snapshot metadata if present)
    if (!employeeScores.has(employeeId)) {
      const meta = empMetaMap.get(employeeId)
      employeeScores.set(employeeId, {
        employee_name: meta?.name || assessment.m_employees?.full_name || 'N/A',
        unit_name: meta?.unit_name || assessment.m_employees?.m_units?.name || 'N/A',
        is_contract: assessment.is_contract,
        contract_percentage: assessment.contract_percentage,
        scores: [],
        p1_scores: [],
        p2_scores: [],
        p3_scores: []
      })
    }
    const empData = employeeScores.get(employeeId)
    if (!isPriority) {
      empData.scores.push(score)
      if (category === 'p1') empData.p1_scores.push(score)
      else if (category === 'p2') empData.p2_scores.push(score)
      else if (category === 'p3') empData.p3_scores.push(score)
    }

    // Collect indicator achievements for improvement areas
    if (!indicatorAchievements.has(indicatorName)) {
      indicatorAchievements.set(indicatorName, {
        indicator_name: indicatorName,
        category: assessment.m_kpi_indicators?.m_kpi_categories?.category || '',
        achievements: []
      })
    }
    indicatorAchievements.get(indicatorName).achievements.push(achievement)
  })

  let reportP1Total = 0, reportP2Total = 0, reportP3Total = 0;
  let reportOverallTotal = 0;
  let empCount = 0;

  const round2 = (num: number) => Number((Math.round((num + 1e-9) * 100) / 100).toFixed(2))

  // Calculate top performers and unit averages
  const topPerformers = Array.from(employeeScores.entries())
    .map(([employeeId, data]: [string, any]) => {
      const isMedical = isMedicalUnit(null, data.unit_name);
      const isPartial = isPartialEligibleUnit(null, data.unit_name) && (revenueType === 'bpjs' || revenueType === 'umum');
      const isContract = Boolean(data.is_contract);
      const pct = data.contract_percentage !== null && data.contract_percentage !== undefined && !isNaN(Number(data.contract_percentage))
        ? Number(data.contract_percentage)
        : 100;
      const contractMultiplier = (isMedical && isContract)
        ? (Math.max(0, pct) / 100)
        : ((isPartial && isContract) ? (Math.max(0, pct) / 100) : 1);

      const p1 = round2(calculateCategoryScore(data.p1_scores, isMedical) * contractMultiplier);
      const p2 = round2(calculateCategoryScore(data.p2_scores, isMedical) * contractMultiplier);
      const p3 = round2(calculateCategoryScore(data.p3_scores, isMedical) * contractMultiplier);

      const total_score = round2(calculateTotalScore(p1, p2, p3, isMedical));

      reportP1Total += p1;
      reportP2Total += p2;
      reportP3Total += p3;
      reportOverallTotal += total_score;
      empCount++;

      return {
        employee_id: employeeId,
        employee_name: data.employee_name,
        unit_name: data.unit_name,
        total_score
      }
    })
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10)

  const p1Average = empCount > 0 ? reportP1Total / empCount : 0;
  const p2Average = empCount > 0 ? reportP2Total / empCount : 0;
  const p3Average = empCount > 0 ? reportP3Total / empCount : 0;
  const overallAverage = empCount > 0 ? reportOverallTotal / empCount : 0;

  // Calculate improvement areas
  const improvementAreas = Array.from(indicatorAchievements.entries())
    .map(([indicatorName, data]: [string, any]) => ({
      indicator_name: data.indicator_name,
      category: data.category,
      average_achievement: data.achievements.reduce((a: number, b: number) => a + b, 0) / data.achievements.length
    }))
    .sort((a, b) => a.average_achievement - b.average_achievement)
    .slice(0, 10)

  const report = {
    period,
    unit_id: unitId,
    unit_name: unitId && unitId !== 'all' ? (employeesData[0] as any)?.m_units?.name : null,
    total_employees: totalEmployees,
    assessed_employees: assessedEmployees,
    completion_rate: completionRate,
    average_score: overallAverage,
    category_breakdown: {
      p1_average: p1Average,
      p2_average: p2Average,
      p3_average: p3Average
    },
    status_distribution: {
      completed: completedEmployees,
      partial: partialEmployees,
      not_started: notStartedEmployees
    },
    top_performers: topPerformers,
    improvement_areas: improvementAreas
  }

  return NextResponse.json({ success: true, report })
}

async function getPeriodComparison(supabase: any, currentEmp: any, currentPeriod: string, unitId?: string | null, revenueType: string = 'bpjs') {
  // Get previous period (assuming YYYY-MM format)
  const [year, month] = currentPeriod.split('-').map(Number)
  const prevDate = new Date(year, month - 2, 1) // month - 2 because Date month is 0-indexed
  const previousPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  // Get current period data
  const currentResponse = await getAssessmentReport(supabase, currentEmp, currentPeriod, unitId, revenueType)
  const currentData = await currentResponse.json()

  // Get previous period data
  const previousResponse = await getAssessmentReport(supabase, currentEmp, previousPeriod, unitId, revenueType)
  const previousData = await previousResponse.json()

  if (!currentData.success || !previousData.success) {
    return NextResponse.json({ success: false, error: 'Failed to fetch comparison data' }, { status: 500 })
  }

  const current = currentData.report
  const previous = previousData.report

  const completionRateChange = current.completion_rate - previous.completion_rate
  const averageScoreChange = current.average_score - previous.average_score

  let trend: 'up' | 'down' | 'stable' = 'stable'
  if (completionRateChange > 1 || averageScoreChange > 1) {
    trend = 'up'
  } else if (completionRateChange < -1 || averageScoreChange < -1) {
    trend = 'down'
  }

  const comparison = {
    current_period: currentPeriod,
    previous_period: previousPeriod,
    completion_rate_change: completionRateChange,
    average_score_change: averageScoreChange,
    trend
  }

  return NextResponse.json({ success: true, comparison })
}