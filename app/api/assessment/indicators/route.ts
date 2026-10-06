import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use admin client to bypass RLS for employee lookup and data queries
    const adminClient = await createAdminClient()

    const appRole = user.app_metadata?.role
    const userRole = user.user_metadata?.role
    const email = user.email

    const isSuperAdmin =
      appRole === 'superadmin' ||
      userRole === 'superadmin' ||
      email === 'admin@sungaipenuh.com'

    // Try by user_id first, then fallback to email
    let currentEmployee: any = null
    const { data: byUserId } = await adminClient
      .from('m_employees')
      .select('id, role, unit_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (byUserId) {
      currentEmployee = byUserId
    } else if (email) {
      const { data: byEmail } = await adminClient
        .from('m_employees')
        .select('id, role, unit_id')
        .eq('email', email)
        .maybeSingle()

      if (byEmail) {
        currentEmployee = byEmail
        // Auto-link user_id for future lookups
        await adminClient
          .from('m_employees')
          .update({ user_id: user.id })
          .eq('id', byEmail.id)
      }
    }

    if (currentEmployee && isSuperAdmin) {
      currentEmployee.role = 'superadmin'
    }

    if (!currentEmployee) {
      if (isSuperAdmin) {
        currentEmployee = {
          id: user.id,
          role: 'superadmin',
          unit_id: '0'
        }
      } else {
        return NextResponse.json({ error: 'Employee record not found' }, { status: 404 })
      }
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employee_id')
    const period = searchParams.get('period')
    const revenueType = searchParams.get('revenue_type') || 'bpjs'

    if (!employeeId || !period) {
      return NextResponse.json(
        { error: 'employee_id and period are required' },
        { status: 400 }
      )
    }

    // Authorization check for unit managers
    if (currentEmployee.role === 'unit_manager') {
      const { data: targetEmployee } = await adminClient
        .from('m_employees')
        .select('unit_id')
        .eq('id', employeeId)
        .single()

      if (!targetEmployee || targetEmployee.unit_id !== currentEmployee.unit_id) {
        return NextResponse.json(
          { error: 'You can only view indicators for employees in your unit' },
          { status: 403 }
        )
      }
    }

    // Get employee's unit
    const { data: employee, error: employeeError } = await adminClient
      .from('m_employees')
      .select('unit_id')
      .eq('id', employeeId)
      .single()

    if (employeeError || !employee) {
      console.error('Employee lookup error:', employeeError)
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    console.log('[indicators] employee unit_id:', employee.unit_id)

    // Check unit's KPI schema mode
    const { data: unitData } = await adminClient
      .from('m_units')
      .select('kpi_schema_mode')
      .eq('id', employee.unit_id)
      .single()

    const isDifferentKPISchema = unitData?.kpi_schema_mode === 'different'

    // Get ALL categories
    const { data: allCategories, error: allCatError } = await adminClient
      .from('m_kpi_categories')
      .select('id, category_name, category, weight_percentage, unit_id, configuration_style, is_weighted, revenue_type')
      .eq('is_active', true)

    console.log('[indicators] allCategories count:', allCategories?.length, 'error:', allCatError?.message)

    // Filter categories by unit and revenue_type if unit uses different KPI schema
    let categories = (allCategories || []).filter(c => {
      if (c.unit_id !== employee.unit_id) return false
      if (isDifferentKPISchema) {
        return c.revenue_type === revenueType || c.revenue_type === 'all' || !c.revenue_type
      }
      // If same KPI schema, take BPJS or all or default categories
      return c.revenue_type === 'bpjs' || c.revenue_type === 'all' || !c.revenue_type
    })

    console.log('[indicators] filtered categories for unit:', categories.length)

    // If no categories in employee's unit, return empty but with helpful message
    if (categories.length === 0) {
      // Check if there are global/shared categories (no unit filter)
      // If still none, return properly
      return NextResponse.json({
        success: true,
        indicators: [],
        total_indicators: 0,
        message: `Tidak ada kategori KPI yang dikonfigurasi untuk unit ini (unit_id: ${employee.unit_id}). Silakan konfigurasi KPI terlebih dahulu di halaman Konfigurasi KPI.`
      })
    }

    const categoryMap = new Map(categories.map(c => [c.id, c]))
    const categoryIds = categories.map(c => c.id)

    // Get indicators for the categories
    const { data: indicators, error: indicatorsError } = await adminClient
      .from('m_kpi_indicators')
      .select('id, code, name, target_value, weight_percentage, category_id, measurement_unit, description, calculation_method, base_index_value')
      .eq('is_active', true)
      .in('category_id', categoryIds)

    if (indicatorsError) {
      console.error('[indicators] indicators query error:', indicatorsError)
      return NextResponse.json({ error: `Failed to fetch indicators: ${indicatorsError.message}` }, { status: 500 })
    }

    console.log('[indicators] indicators count:', indicators?.length)

    const indicatorIds = indicators?.map(i => i.id) || []

    // Get sub indicators only if there are indicators
    let subIndicators: any[] = []
    if (indicatorIds.length > 0) {
      const { data: subInds, error: subIndicatorsError } = await adminClient
        .from('m_kpi_sub_indicators')
        .select('id, indicator_id, code, name, target_value, weight_percentage, scoring_criteria, measurement_unit, description, measurement_type, unit_tariff, base_index_value, service_types')
        .eq('is_active', true)
        .in('indicator_id', indicatorIds)

      if (subIndicatorsError) {
        console.error('[indicators] sub-indicators query error:', subIndicatorsError)
        return NextResponse.json({ error: `Failed to fetch sub-indicators: ${subIndicatorsError.message}` }, { status: 500 })
      }
      subIndicators = subInds || []

      // Note: m_master_tariffs query removed as it was causing 500 errors.
      // Sub-indicators now handle their own data mapping without requiring a separate master tariff join here.
      subIndicators = subInds?.map(sub => ({
        ...sub,
        tariffs: [] // Placeholder for now or removed if not needed in the list view
      })) || []
    }

    console.log('[indicators] sub-indicators count:', subIndicators.length)

    // Group and map sub-indicators by indicator
    const subIndicatorMap = new Map<string, any[]>()
    subIndicators.forEach((sub: any) => {
      if (!subIndicatorMap.has(sub.indicator_id)) {
        subIndicatorMap.set(sub.indicator_id, [])
      }

      subIndicatorMap.get(sub.indicator_id)!.push({
        id: sub.id,
        indicator_id: sub.indicator_id,
        code: sub.code,
        name: sub.name,
        target_value: sub.target_value,
        weight_percentage: sub.weight_percentage,
        scoring_criteria: sub.scoring_criteria || [],
        measurement_unit: sub.measurement_unit,
        description: sub.description,
        measurement_type: sub.measurement_type,
        unit_tariff: sub.unit_tariff,
        base_index_value: sub.base_index_value,
        service_types: sub.service_types,
        tariffs: sub.tariffs
      })

    })

    // Get existing assessments
    let assessmentsQuery = adminClient
      .from('t_kpi_assessments')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('period', period)

    if (revenueType) {
      assessmentsQuery = assessmentsQuery.or(`revenue_type.eq.${revenueType},revenue_type.is.null`)
    }

    const { data: existingAssessments, error: assessmentsError } = await assessmentsQuery.order('created_at')

    if (assessmentsError) {
      console.error('[indicators] assessments query error:', assessmentsError)
      return NextResponse.json({ error: `Failed to fetch assessments: ${assessmentsError.message}` }, { status: 500 })
    }

    // Map existing assessments to their indicator_id
    const assessmentMap = new Map()
    if (existingAssessments) {
      existingAssessments.forEach((a: any) => {
        assessmentMap.set(a.indicator_id, a)
      })
    }

    // Map indicators with current assessments and sub-indicators
    const indicatorsWithAssessments = (indicators || []).map((indicator: any) => {
      const category = categoryMap.get(indicator.category_id)
      return {
        id: indicator.id,
        code: indicator.code,
        name: indicator.name,
        target_value: indicator.target_value,
        weight_percentage: indicator.weight_percentage,
        calculation_method: indicator.calculation_method || 'indexing',
        base_index_value: indicator.base_index_value || 0,
        measurement_type: indicator.measurement_type || 'scoring',
        unit_tariff: indicator.unit_tariff || 0,
        service_types: indicator.service_types || [],
        category_id: indicator.category_id,
        category_name: category?.category_name || 'Tanpa Kategori',
        category_type: category?.category || 'Unknown',
        category_weight: category?.weight_percentage || 0,
        category_style: category?.configuration_style || 'index',
        category_is_weighted: category?.is_weighted !== false,
        measurement_unit: indicator.measurement_unit,
        description: indicator.description,
        sub_indicators: subIndicatorMap.get(indicator.id) || [],
        current_assessment: assessmentMap.get(indicator.id)
      }
    })

    // Group indicators by category
    const groupedIndicators = indicatorsWithAssessments.reduce((acc: any, indicator: any) => {
      const categoryType = indicator.category_type || 'Unknown'
      if (!acc[categoryType]) {
        acc[categoryType] = {
          category: categoryType,
          category_name: indicator.category_name,
          weight_percentage: indicator.category_weight,
          configuration_style: indicator.category_style,
          is_weighted: indicator.category_is_weighted,
          indicators: []
        }
      }
      acc[categoryType].indicators.push(indicator)
      return acc
    }, {})

    // Convert to array and sort by category (P1, P2, P3)
    const categorizedIndicators = Object.values(groupedIndicators).sort((a: any, b: any) => {
      const order: Record<string, number> = { 'P1': 1, 'P2': 2, 'P3': 3 }
      const orderA = order[a.category] || 99
      const orderB = order[b.category] || 99
      return orderA - orderB
    })

    return NextResponse.json({
      success: true,
      indicators: categorizedIndicators,
      total_indicators: indicatorsWithAssessments.length
    })
  } catch (error: any) {
    console.error('Assessment indicators GET error:', error)
    return NextResponse.json(
      {
        error: 'Gagal memuat indikator KPI',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
