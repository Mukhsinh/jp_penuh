import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface Assessment {
  id?: string
  employee_id: string
  indicator_id: string
  period: string
  realization_value: number
  target_value: number
  weight_percentage: number
  achievement_percentage?: number
  score?: number
  notes?: string
  sub_assessments?: any
  assessor_id: string
  revenue_type?: string
  created_at?: string
  updated_at?: string
}

/**
 * Find employee record for authenticated user.
 * Tries user_id first, then falls back to email match.
 */
async function findEmployeeForUser(adminClient: any, userId: string, authUser: any) {
  // 1. Check if user is superadmin via Auth Metadata or Email
  const userMeta = authUser.user_metadata || {}
  const appMeta = authUser.app_metadata || {}
  const rawRole = (appMeta.role || userMeta.role || '').toString().toLowerCase()
  const isSuperAdmin = rawRole === 'superadmin' || rawRole === 'admin' || authUser.email === 'admin@sungaipenuh.com'

  // 2. Try by user_id first
  const { data: employeeData } = await adminClient
    .from('m_employees')
    .select('id, role, unit_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (employeeData) {
    // If found and user is superadmin but record says otherwise, override for consistency
    if (isSuperAdmin) {
      employeeData.role = 'superadmin'
    }
    return employeeData
  }

  // 3. Fallback for Superadmins: return virtual employee record
  if (isSuperAdmin) {
    return {
      id: 'superadmin-virtual',
      role: 'superadmin',
      unit_id: '0'
    }
  }

  return null
}

// Simple audit logging function
async function logAssessmentAudit(
  operation: 'CREATE' | 'UPDATE',
  recordId: string,
  details: string,
  client: any
) {
  try {
    await client
      .from('t_audit_log')
      .insert({
        table_name: 't_kpi_assessments',
        operation,
        record_id: recordId,
        details,
        created_at: new Date().toISOString()
      })
  } catch (error: any) {
    console.error('Audit logging failed:', error)
  }
}

async function getAssessmentsForEmployee(adminClient: any, employeeId: string, period: string): Promise<Assessment[]> {
  const { data, error } = await adminClient
    .from('t_kpi_assessments')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('period', period)
    .order('created_at')

  if (error) {
    throw new Error(`Failed to fetch assessments: ${error.message}`)
  }
  return data || []
}

async function upsertAssessment(adminClient: any, assessment: Assessment): Promise<Assessment> {
  const achievement = assessment.achievement_percentage !== undefined
    ? assessment.achievement_percentage
    : (assessment.target_value === 0 ? 100 : (assessment.realization_value / assessment.target_value) * 100)

  const score = assessment.score !== undefined
    ? assessment.score
    : (achievement * assessment.weight_percentage) / 100

  const revType = assessment.revenue_type || 'bpjs'

  // Look up existing assessment ID for this exact revenue_type if ID not provided
  let existingId = assessment.id
  if (!existingId) {
    const { data: existingRows } = await adminClient
      .from('t_kpi_assessments')
      .select('id')
      .eq('employee_id', assessment.employee_id)
      .eq('indicator_id', assessment.indicator_id)
      .eq('period', assessment.period)
      .eq('revenue_type', revType)
      .is('sub_indicator_id', null)
      .limit(1)

    if (existingRows && existingRows.length > 0) {
      existingId = existingRows[0].id
    }
  }

  // 1. Prepare Main Assessment Data
  // Note: achievement_percentage and score are GENERATED ALWAYS columns in PostgreSQL, so we omit them
  // to allow Postgres to generate them automatically without throwing non-DEFAULT column errors.
  const assessmentData: any = {
    employee_id: assessment.employee_id,
    indicator_id: assessment.indicator_id,
    sub_indicator_id: null,
    period: assessment.period,
    realization_value: assessment.realization_value,
    target_value: assessment.target_value,
    weight_percentage: assessment.weight_percentage,
    notes: assessment.notes,
    assessor_id: assessment.assessor_id,
    revenue_type: revType,
    updated_at: new Date().toISOString()
  }

  let savedData: any = null

  // 2. Update existing assessment or insert new assessment using explicit ID matching
  if (existingId) {
    const { data, error: updateError } = await adminClient
      .from('t_kpi_assessments')
      .update(assessmentData)
      .eq('id', existingId)
      .select()
      .single()

    if (updateError) {
      console.error('Main assessment update error:', updateError)
      throw new Error(`Failed to save assessment: ${updateError.message}`)
    }
    savedData = data
  } else {
    const { data, error: insertError } = await adminClient
      .from('t_kpi_assessments')
      .insert(assessmentData)
      .select()
      .single()

    if (insertError) {
      console.error('Main assessment insert error:', insertError)
      throw new Error(`Failed to save assessment: ${insertError.message}`)
    }
    savedData = data
  }

  // 3. Handle Sub-Assessments if provided
  if (assessment.sub_assessments && Array.isArray(assessment.sub_assessments)) {
    let aggregateScore = 0
    let aggregateRealization = 0

    for (const sub of assessment.sub_assessments) {
      const subScore = sub.score || 0
      const subRealization = sub.realization_value || 0
      aggregateScore += subScore
      aggregateRealization += subRealization

      let subExistingId = sub.id
      if (!subExistingId) {
        const { data: existingSubRows } = await adminClient
          .from('t_kpi_assessments')
          .select('id')
          .eq('employee_id', assessment.employee_id)
          .eq('indicator_id', assessment.indicator_id)
          .eq('sub_indicator_id', sub.sub_indicator_id)
          .eq('period', assessment.period)
          .eq('revenue_type', revType)
          .limit(1)

        if (existingSubRows && existingSubRows.length > 0) {
          subExistingId = existingSubRows[0].id
        }
      }

      const subData: any = {
        employee_id: assessment.employee_id,
        indicator_id: assessment.indicator_id,
        sub_indicator_id: sub.sub_indicator_id,
        period: assessment.period,
        realization_value: subRealization,
        target_value: 0,
        weight_percentage: 0,
        notes: sub.notes || '',
        assessor_id: assessment.assessor_id,
        revenue_type: revType,
        updated_at: new Date().toISOString()
      }

      if (subExistingId) {
        const { error: subUpdateError } = await adminClient
          .from('t_kpi_assessments')
          .update(subData)
          .eq('id', subExistingId)

        if (subUpdateError) {
          console.error('Sub-assessment update error:', subUpdateError)
          throw new Error(`Failed to save sub-indicators: ${subUpdateError.message}`)
        }
      } else {
        const { error: subInsertError } = await adminClient
          .from('t_kpi_assessments')
          .insert(subData)

        if (subInsertError) {
          console.error('Sub-assessment insert error:', subInsertError)
          throw new Error(`Failed to save sub-indicators: ${subInsertError.message}`)
        }
      }
    }

    if (assessment.sub_assessments.length > 0) {
      // 4. Sync main row realization value
      const { error: syncError } = await adminClient
        .from('t_kpi_assessments')
        .update({
          realization_value: aggregateRealization,
          updated_at: new Date().toISOString()
        })
        .eq('employee_id', assessment.employee_id)
        .eq('indicator_id', assessment.indicator_id)
        .eq('period', assessment.period)
        .eq('revenue_type', revType)
        .is('sub_indicator_id', null)

      if (syncError) {
        console.error('Main row score sync error:', syncError)
      } else if (savedData) {
        savedData.score = aggregateScore
        savedData.realization_value = aggregateRealization
      }
    }
  }

  return savedData
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

    const adminClient = await createAdminClient()

    // Find current user's role and unit
    const currentEmployee = await findEmployeeForUser(adminClient, user.id, user)
    if (!currentEmployee) {
      return NextResponse.json({ error: 'Employee record not found' }, { status: 404 })
    }

    // Enforce unit isolation for unit managers
    if (currentEmployee.role === 'unit_manager') {
      const { data: targetEmployee } = await adminClient
        .from('m_employees')
        .select('unit_id')
        .eq('id', employeeId)
        .single()

      if (!targetEmployee || targetEmployee.unit_id !== currentEmployee.unit_id) {
        return NextResponse.json(
          { error: 'You can only view assessments for employees in your unit' },
          { status: 403 }
        )
      }
    }

    const { data: assessments, error: fetchErr } = await adminClient
      .from('t_kpi_assessments')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('period', period)
      .or(`revenue_type.eq.${revenueType},revenue_type.is.null`)
      .order('created_at')

    if (fetchErr) {
      throw new Error(`Failed to fetch assessments: ${fetchErr.message}`)
    }

    return NextResponse.json({ assessments: assessments || [] })
  } catch (error: any) {
    console.error('Assessment GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assessments' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use admin client to bypass RLS for employee lookup
    const adminClient = await createAdminClient()
    const currentEmployee = await findEmployeeForUser(adminClient, user.id, user)

    if (!currentEmployee) {
      console.error('Employee not found for user:', user.email, user.id)
      return NextResponse.json({ error: 'Employee record not found' }, { status: 404 })
    }

    // Enforce RBAC
    if (currentEmployee.role !== 'superadmin' && currentEmployee.role !== 'unit_manager') {
      return NextResponse.json(
        { error: 'Hanya superadmin atau manajer unit yang dapat memberikan penilaian' },
        { status: 403 }
      )
    }

    const rawBody = await request.json()

    // Support both direct array and object with { assessments, apply_to_umum }
    let itemsToProcess: any[] = []
    let applyToUmum = false

    if (Array.isArray(rawBody)) {
      itemsToProcess = rawBody
    } else if (rawBody && typeof rawBody === 'object') {
      if (Array.isArray(rawBody.assessments)) {
        itemsToProcess = rawBody.assessments
      } else {
        itemsToProcess = [rawBody]
      }
      if (rawBody.apply_to_umum) {
        applyToUmum = true
      }
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data penilaian' }, { status: 400 })
    }

    // Validate that period is specified and exists in t_pool
    const samplePeriod = itemsToProcess[0]?.period
    if (!samplePeriod || samplePeriod.trim() === '') {
      return NextResponse.json({ error: 'Periode penilaian harus dipilih terlebih dahulu' }, { status: 400 })
    }

    const { data: poolCheck } = await adminClient
      .from('t_pool')
      .select('period')
      .eq('period', samplePeriod)
      .maybeSingle()

    if (!poolCheck) {
      return NextResponse.json({ error: `Periode ${samplePeriod} belum memiliki pool pendapatan` }, { status: 400 })
    }

    const results = []
    for (const item of itemsToProcess) {
      const assessmentItem: Assessment = {
        ...item,
        assessor_id: currentEmployee.id
      }

      // Basic authorization for each item if manager
      if (currentEmployee.role === 'unit_manager') {
        const { data: targetEmployee } = await adminClient
          .from('m_employees')
          .select('unit_id')
          .eq('id', assessmentItem.employee_id)
          .single()

        if (!targetEmployee || targetEmployee.unit_id !== currentEmployee.unit_id) {
          continue // Skip unauthorized items
        }
      }

      const saved = await upsertAssessment(adminClient, assessmentItem)
      results.push(saved)

      // If applyToUmum is enabled and current item is for bpjs, also copy to 'umum'
      if (applyToUmum && (assessmentItem.revenue_type === 'bpjs' || !assessmentItem.revenue_type)) {
        // Fetch unit schema mode for this employee
        const { data: empUnitData } = await adminClient
          .from('m_employees')
          .select('unit_id, m_units(kpi_schema_mode)')
          .eq('id', assessmentItem.employee_id)
          .maybeSingle()

        const uData = Array.isArray(empUnitData?.m_units) ? empUnitData.m_units[0] : empUnitData?.m_units
        const schemaMode = uData?.kpi_schema_mode || 'same'

        if (schemaMode === 'different' && empUnitData?.unit_id) {
          // Find target UMUM indicator corresponding to BPJS indicator
          const { data: bpjsInd } = await adminClient
            .from('m_kpi_indicators')
            .select('code, name, m_kpi_categories(category, category_name)')
            .eq('id', assessmentItem.indicator_id)
            .maybeSingle()

          if (bpjsInd) {
            const catCode = (bpjsInd as any).m_kpi_categories?.category
            const { data: umumCat } = await adminClient
              .from('m_kpi_categories')
              .select('id')
              .eq('unit_id', empUnitData.unit_id)
              .eq('revenue_type', 'umum')
              .eq('category', catCode)
              .maybeSingle()

            if (umumCat) {
              const { data: umumInd } = await adminClient
                .from('m_kpi_indicators')
                .select('id')
                .eq('category_id', umumCat.id)
                .eq('code', bpjsInd.code)
                .maybeSingle()

              if (umumInd) {
                let mappedSubAssessments = assessmentItem.sub_assessments
                if (Array.isArray(assessmentItem.sub_assessments) && assessmentItem.sub_assessments.length > 0) {
                  const { data: umumSubs } = await adminClient
                    .from('m_kpi_sub_indicators')
                    .select('id, code')
                    .eq('indicator_id', umumInd.id)

                  const subCodeMap = new Map((umumSubs || []).map((s: any) => [s.code, s.id]))
                  mappedSubAssessments = assessmentItem.sub_assessments.map((s: any) => ({
                    ...s,
                    id: undefined,
                    sub_indicator_id: subCodeMap.get(s.code) || s.sub_indicator_id
                  }))
                }

                const copyItem: Assessment = {
                  ...assessmentItem,
                  id: undefined,
                  indicator_id: umumInd.id,
                  revenue_type: 'umum',
                  sub_assessments: mappedSubAssessments?.map((s: any) => ({ ...s, id: undefined }))
                }
                const savedUmum = await upsertAssessment(adminClient, copyItem)
                results.push(savedUmum)
              }
            }
          }
        } else {
          // Standard 'same' schema mode: same indicator_id
          const copyItem: Assessment = {
            ...assessmentItem,
            id: undefined,
            revenue_type: 'umum',
            sub_assessments: assessmentItem.sub_assessments?.map((s: any) => ({ ...s, id: undefined }))
          }
          const savedUmum = await upsertAssessment(adminClient, copyItem)
          results.push(savedUmum)
        }
      }
    }

    return NextResponse.json({ assessments: results })
  } catch (error: any) {
    console.error('Assessment POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save assessment' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use admin client to bypass RLS for employee lookup
    const adminClient = await createAdminClient()
    const currentEmployee = await findEmployeeForUser(adminClient, user.id, user)

    if (!currentEmployee) {
      console.error('Employee not found for user:', user.email, user.id)
      return NextResponse.json({ error: 'Employee record not found' }, { status: 404 })
    }

    // Enforce RBAC
    if (currentEmployee.role !== 'superadmin' && currentEmployee.role !== 'unit_manager') {
      return NextResponse.json(
        { error: 'Hanya superadmin atau manajer unit yang dapat memberikan penilaian' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const assessment: Assessment = {
      ...body,
      assessor_id: currentEmployee.id
    }

    // Authorization check
    if (currentEmployee.role === 'unit_manager') {
      const { data: targetEmployee } = await adminClient
        .from('m_employees')
        .select('unit_id')
        .eq('id', assessment.employee_id)
        .single()

      if (!targetEmployee || targetEmployee.unit_id !== currentEmployee.unit_id) {
        return NextResponse.json(
          { error: 'You can only assess employees in your unit' },
          { status: 403 }
        )
      }
    }

    const updatedAssessment = await upsertAssessment(adminClient, assessment)

    return NextResponse.json({ assessment: updatedAssessment })
  } catch (error: any) {
    console.error('Assessment PUT error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update assessment' },
      { status: 500 }
    )
  }
}