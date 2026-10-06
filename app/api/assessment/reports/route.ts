import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isMedicalUnit } from '@/lib/utils/medical-unit'
import { calculateCategoryScore, calculateTotalScore } from '@/lib/utils/score-calculator'

async function getUserEmployee(adminClient: any, user: any) {
  const { data: emp } = await adminClient
    .from('m_employees')
    .select('id, role, unit_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (emp) return emp

  if (user.email) {
    const { data: byEmail } = await adminClient
      .from('m_employees')
      .select('id, role, unit_id')
      .eq('email', user.email)
      .maybeSingle()

    if (byEmail) return byEmail
  }

  const isSuperAdmin =
    user.app_metadata?.role === 'superadmin' ||
    user.user_metadata?.role === 'superadmin' ||
    user.email === 'admin@sungaipenuh.com'

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
        return await getAssessmentReport(adminClient, currentEmp, period, unitId)

      case 'comparison':
        if (!period) {
          return NextResponse.json({ success: false, error: 'Period is required' }, { status: 400 })
        }
        return await getPeriodComparison(adminClient, currentEmp, period, unitId)

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
  const { data, error } = await supabase
    .from('t_pool')
    .select('period')
    .order('period', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  let periods = data?.map((item: any) => item.period) || []
  if (periods.length === 0) {
    const currentMonth = new Date().toISOString().slice(0, 7)
    periods = [currentMonth]
  }
  return NextResponse.json({ success: true, periods })
}

async function getAvailableUnits(supabase: any, currentEmp: any) {
  const userRole = currentEmp?.role

  let query = supabase
    .from('m_units')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  // If unit manager, only show their unit
  if (userRole === 'unit_manager' && currentEmp?.unit_id) {
    query = query.eq('id', currentEmp.unit_id)
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

async function getAssessmentReport(supabase: any, currentEmp: any, period: string, unitId?: string | null) {
  const userRole = currentEmp?.role
  const userUnitId = currentEmp?.unit_id

  // Build base query for employees
  let employeeQuery = supabase
    .from('m_employees')
    .select('id, full_name, unit_id, m_units(name)')
    .eq('is_active', true)
    .neq('role', 'superadmin')

  // Apply unit filtering based on role
  if (userRole === 'unit_manager' && userUnitId) {
    employeeQuery = employeeQuery.eq('unit_id', userUnitId)
  } else if (unitId && unitId !== 'all') {
    employeeQuery = employeeQuery.eq('unit_id', unitId)
  }

  const { data: employeesData, error: employeeError } = await employeeQuery

  if (employeeError) {
    return NextResponse.json({ success: false, error: employeeError.message }, { status: 500 })
  }

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

  // Get detailed assessment data for score calculations with inner join
  let assessmentQuery = supabase
    .from('t_kpi_assessments')
    .select(`
      *,
      m_employees!inner!employee_id (
        full_name,
        role,
        unit_id,
        m_units!unit_id (name)
      ),
      m_kpi_indicators!inner!indicator_id (
        name,
        m_kpi_categories!inner!category_id (
          category
        )
      )
    `)
    .eq('period', period)
    .neq('m_employees.role', 'superadmin')

  // Apply same unit filtering
  if (userRole === 'unit_manager' && userUnitId) {
    assessmentQuery = assessmentQuery.eq('m_employees.unit_id', userUnitId)
  } else if (unitId && unitId !== 'all') {
    assessmentQuery = assessmentQuery.eq('m_employees.unit_id', unitId)
  }

  const { data: assessmentData, error: assessmentError } = await assessmentQuery

  if (assessmentError) {
    console.error('Report assessmentQuery error:', assessmentError)
    return NextResponse.json({ success: false, error: assessmentError.message }, { status: 500 })
  }

  // Calculate category averages
  const employeeScores = new Map()
  const indicatorAchievements = new Map()

  assessmentData?.forEach((assessment: any) => {
    const category = assessment.m_kpi_indicators?.m_kpi_categories?.category?.toLowerCase() || ''
    const score = assessment.score || 0
    const achievement = assessment.achievement_percentage || 0
    const employeeId = assessment.employee_id
    const indicatorName = assessment.m_kpi_indicators?.name || '-'

    const isPriority = assessment.m_kpi_indicators?.calculation_method === 'priority'

    // Collect employee total scores
    if (!employeeScores.has(employeeId)) {
      employeeScores.set(employeeId, {
        employee_name: assessment.m_employees?.full_name || 'N/A',
        unit_name: assessment.m_employees?.m_units?.name || 'N/A',
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

  // Calculate top performers and unit averages
  const topPerformers = Array.from(employeeScores.entries())
    .map(([employeeId, data]: [string, any]) => {
      const isMedical = isMedicalUnit(null, data.unit_name);

      const p1 = calculateCategoryScore(data.p1_scores, isMedical);
      const p2 = calculateCategoryScore(data.p2_scores, isMedical);
      const p3 = calculateCategoryScore(data.p3_scores, isMedical);

      const total_score = calculateTotalScore(p1, p2, p3, isMedical);

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

async function getPeriodComparison(supabase: any, currentEmp: any, currentPeriod: string, unitId?: string | null) {
  // Get previous period (assuming YYYY-MM format)
  const [year, month] = currentPeriod.split('-').map(Number)
  const prevDate = new Date(year, month - 2, 1) // month - 2 because Date month is 0-indexed
  const previousPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  // Get current period data
  const currentResponse = await getAssessmentReport(supabase, currentEmp, currentPeriod, unitId)
  const currentData = await currentResponse.json()

  // Get previous period data
  const previousResponse = await getAssessmentReport(supabase, currentEmp, previousPeriod, unitId)
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