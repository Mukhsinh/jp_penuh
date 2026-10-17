import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

  // 3. Fallback for Superadmins: return virtual employee record with valid UUID
  if (isSuperAdmin) {
    const { data: adminEmp } = await adminClient
      .from('m_employees')
      .select('id, role, unit_id')
      .or('role.eq.superadmin,role.eq.admin,email.eq.admin@sungaipenuh.com')
      .limit(1)
      .maybeSingle()

    return {
      id: adminEmp?.id || userId,
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

async function upsertAssessment(
  adminClient: any,
  assessment: Assessment,
  existingMap?: Map<string, string>
): Promise<Assessment> {
  const revType = assessment.revenue_type || 'bpjs'

  // Pre-calculate sub-assessments aggregate before saving main row
  let aggregateScore = 0
  let aggregateRealization = 0
  const hasSubs = Array.isArray(assessment.sub_assessments) && assessment.sub_assessments.length > 0

  if (hasSubs) {
    for (const sub of assessment.sub_assessments) {
      aggregateScore += (sub.score || 0)
      aggregateRealization += (sub.realization_value || 0)
    }
  }

  // Look up existing assessment ID for this exact revenue_type if ID not provided
  let existingId = assessment.id
  if (!existingId) {
    const mainKey = `${assessment.employee_id}:${assessment.indicator_id}:${assessment.period}:${revType}:main`
    if (existingMap && existingMap.has(mainKey)) {
      existingId = existingMap.get(mainKey)
    } else {
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
  }

  // 1. Prepare Main Assessment Data
  const effectiveRealization = hasSubs ? aggregateRealization : assessment.realization_value
  const assessmentData: any = {
    employee_id: assessment.employee_id,
    indicator_id: assessment.indicator_id,
    sub_indicator_id: null,
    period: assessment.period,
    realization_value: effectiveRealization,
    target_value: assessment.target_value,
    weight_percentage: assessment.weight_percentage,
    notes: assessment.notes,
    score: (assessment.score !== undefined && assessment.score !== null)
      ? assessment.score
      : (hasSubs ? aggregateScore : (assessment.score ?? effectiveRealization)),
    assessor_id: assessment.assessor_id,
    revenue_type: revType,
    updated_at: new Date().toISOString()
  }

  let savedData: any = null

  // 2. Update existing assessment or insert new assessment
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
    if (existingMap && data?.id) {
      const mainKey = `${assessment.employee_id}:${assessment.indicator_id}:${assessment.period}:${revType}:main`
      existingMap.set(mainKey, data.id)
    }
  }

  // 3. Handle Sub-Assessments concurrently in parallel
  if (hasSubs) {
    const subPromises = assessment.sub_assessments.map(async (sub: any) => {
      const subScore = sub.score || 0
      const subRealization = sub.realization_value || 0

      let subExistingId = sub.id
      const subKey = `${assessment.employee_id}:${assessment.indicator_id}:${assessment.period}:${revType}:${sub.sub_indicator_id}`
      if (!subExistingId) {
        if (existingMap && existingMap.has(subKey)) {
          subExistingId = existingMap.get(subKey)
        } else {
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
      }

      const subData: any = {
        employee_id: assessment.employee_id,
        indicator_id: assessment.indicator_id,
        sub_indicator_id: sub.sub_indicator_id,
        period: assessment.period,
        realization_value: subRealization,
        score: subScore,
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
        const { data: newSubRow, error: subInsertError } = await adminClient
          .from('t_kpi_assessments')
          .insert(subData)
          .select('id')
          .single()

        if (subInsertError) {
          console.error('Sub-assessment insert error:', subInsertError)
          throw new Error(`Failed to save sub-indicators: ${subInsertError.message}`)
        }
        if (newSubRow?.id && existingMap) {
          existingMap.set(subKey, newSubRow.id)
        }
      }

      // Mirror sub-indicator to t_realization
      try {
        const { data: existingSubReal } = await adminClient
          .from('t_realization')
          .select('id')
          .eq('employee_id', assessment.employee_id)
          .eq('indicator_id', assessment.indicator_id)
          .eq('sub_indicator_id', sub.sub_indicator_id)
          .eq('period', assessment.period)
          .eq('revenue_type', revType)
          .maybeSingle()

        const subRealPayload = {
          employee_id: assessment.employee_id,
          indicator_id: assessment.indicator_id,
          sub_indicator_id: sub.sub_indicator_id,
          period: assessment.period,
          realization_value: subRealization,
          score: subScore,
          notes: sub.notes || null,
          created_by: assessment.assessor_id || null,
          revenue_type: revType
        }

        if (existingSubReal?.id) {
          await adminClient.from('t_realization').update(subRealPayload).eq('id', existingSubReal.id)
        } else {
          await adminClient.from('t_realization').insert(subRealPayload)
        }
      } catch (srErr) {
        console.warn('Mirror sub to t_realization error:', srErr)
      }
    })

    await Promise.all(subPromises)

    if (savedData) {
      savedData.score = aggregateScore
      savedData.realization_value = aggregateRealization
    }
  }

  // Mirror main indicator row to t_realization
  try {
    const { data: existingReal } = await adminClient
      .from('t_realization')
      .select('id')
      .eq('employee_id', assessment.employee_id)
      .eq('indicator_id', assessment.indicator_id)
      .eq('period', assessment.period)
      .eq('revenue_type', revType)
      .is('sub_indicator_id', null)
      .maybeSingle()

    const realPayload = {
      employee_id: assessment.employee_id,
      indicator_id: assessment.indicator_id,
      sub_indicator_id: null,
      period: assessment.period,
      realization_value: savedData?.realization_value ?? assessmentData.realization_value,
      achievement_percentage: assessmentData.achievement_percentage,
      score: savedData?.score ?? assessmentData.score,
      notes: assessment.notes || null,
      created_by: assessment.assessor_id || null,
      revenue_type: revType
    }

    if (existingReal?.id) {
      await adminClient.from('t_realization').update(realPayload).eq('id', existingReal.id)
    } else {
      await adminClient.from('t_realization').insert(realPayload)
    }
  } catch (rErr) {
    console.warn('Mirror main to t_realization error:', rErr)
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

    return NextResponse.json({ assessments: assessments || [] }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate'
      }
    })
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
      .select('period, status')
      .eq('period', samplePeriod)
      .maybeSingle()

    if (!poolCheck) {
      return NextResponse.json({ error: `Periode ${samplePeriod} belum memiliki pool pendapatan` }, { status: 400 })
    }

    const { data: remCheck } = await adminClient
      .from('remunerasi_periode')
      .select('status')
      .eq('periode', samplePeriod)
      .maybeSingle()

    if (poolCheck.status === 'approved' || remCheck?.status === 'approved') {
      return NextResponse.json({
        error: `Periode ${samplePeriod} telah disetujui oleh Superadmin dan berstatus terkunci. Penilaian tidak dapat diubah.`
      }, { status: 403 })
    }

    // Optimization: Batch fetch employee details & unit information
    const uniqueEmpIds = Array.from(new Set(itemsToProcess.map((i: any) => i.employee_id).filter(Boolean)))
    const { data: targetEmps } = await adminClient
      .from('m_employees')
      .select('id, unit_id, m_units(kpi_schema_mode)')
      .in('id', uniqueEmpIds)

    const empUnitMap = new Map((targetEmps || []).map((e: any) => [e.id, e]))

    // Optimization: Batch fetch existing assessment IDs for this period to eliminate N+1 queries
    const { data: existingRecords } = await adminClient
      .from('t_kpi_assessments')
      .select('id, employee_id, indicator_id, sub_indicator_id, period, revenue_type')
      .in('employee_id', uniqueEmpIds)
      .eq('period', samplePeriod)

    const existingMap = new Map<string, string>()
    existingRecords?.forEach((r: any) => {
      const subKey = r.sub_indicator_id ? r.sub_indicator_id : 'main'
      const key = `${r.employee_id}:${r.indicator_id}:${r.period}:${r.revenue_type || 'bpjs'}:${subKey}`
      existingMap.set(key, r.id)
    })

    // Batch preload UMUM indicators/sub-indicators for units with kpi_schema_mode === 'different'
    // This avoids querying the DB 4 times per indicator inside the loop!
    const diffUnitIds = Array.from(new Set(
      Array.from(empUnitMap.values())
        .filter((e: any) => {
          const uData = Array.isArray(e.m_units) ? e.m_units[0] : e.m_units
          return uData?.kpi_schema_mode === 'different'
        })
        .map((e: any) => e.unit_id)
        .filter(Boolean)
    ))

    const bpjsToUmumIndMap = new Map<string, string>()
    const bpjsToUmumSubMap = new Map<string, string>()
    const bpjsSubCodeToUmumSubMap = new Map<string, string>()

    if (diffUnitIds.length > 0 && applyToUmum) {
      const [bpjsCatsRes, umumCatsRes] = await Promise.all([
        adminClient.from('m_kpi_categories').select('id, unit_id, category').in('unit_id', diffUnitIds).eq('revenue_type', 'bpjs'),
        adminClient.from('m_kpi_categories').select('id, unit_id, category').in('unit_id', diffUnitIds).eq('revenue_type', 'umum')
      ])
      const bpjsCats = bpjsCatsRes.data || []
      const umumCats = umumCatsRes.data || []

      const bpjsCatIds = bpjsCats.map((c: any) => c.id)
      const umumCatIds = umumCats.map((c: any) => c.id)

      if (bpjsCatIds.length > 0 && umumCatIds.length > 0) {
        const [bpjsIndsRes, umumIndsRes] = await Promise.all([
          adminClient.from('m_kpi_indicators').select('id, code, category_id, m_kpi_categories(category, unit_id), m_kpi_sub_indicators(id, code, name)').in('category_id', bpjsCatIds),
          adminClient.from('m_kpi_indicators').select('id, code, category_id, m_kpi_categories(category, unit_id), m_kpi_sub_indicators(id, code, name)').in('category_id', umumCatIds)
        ])

        const bpjsInds = bpjsIndsRes.data || []
        const umumInds = umumIndsRes.data || []

        for (const bInd of bpjsInds) {
          const bCat = (bInd.m_kpi_categories as any)?.category
          const bUnit = (bInd.m_kpi_categories as any)?.unit_id

          const uInd = umumInds.find((u: any) => {
            const uCat = (u.m_kpi_categories as any)?.category
            const uUnit = (u.m_kpi_categories as any)?.unit_id
            return uUnit === bUnit && uCat === bCat && u.code === bInd.code
          })

          if (uInd) {
            bpjsToUmumIndMap.set(bInd.id, uInd.id)
            for (const bSub of (bInd.m_kpi_sub_indicators || [])) {
              const uSub = (uInd.m_kpi_sub_indicators || []).find((s: any) => s.code === bSub.code || s.name === bSub.name)
              if (uSub) {
                bpjsToUmumSubMap.set(bSub.id, uSub.id)
                bpjsSubCodeToUmumSubMap.set(`${uInd.id}:${bSub.code}`, uSub.id)
              }
            }
          }
        }
      }
    }

    const results = []
    for (const item of itemsToProcess) {
      const assessmentItem: Assessment = {
        ...item,
        assessor_id: currentEmployee.id
      }

      // Authorization check using in-memory empUnitMap
      if (currentEmployee.role === 'unit_manager') {
        const empData = empUnitMap.get(assessmentItem.employee_id)
        if (!empData || empData.unit_id !== currentEmployee.unit_id) {
          continue // Skip unauthorized items
        }
      }

      const saved = await upsertAssessment(adminClient, assessmentItem, existingMap)
      results.push(saved)

      // If applyToUmum is enabled and current item is for bpjs, also copy to 'umum'
      if (applyToUmum && (assessmentItem.revenue_type === 'bpjs' || !assessmentItem.revenue_type)) {
        const empUnitData = empUnitMap.get(assessmentItem.employee_id)
        const uData = Array.isArray(empUnitData?.m_units) ? empUnitData.m_units[0] : empUnitData?.m_units
        const schemaMode = uData?.kpi_schema_mode || 'same'

        if (schemaMode === 'different' && empUnitData?.unit_id) {
          const targetUmumIndId = bpjsToUmumIndMap.get(assessmentItem.indicator_id)
          if (targetUmumIndId) {
            let mappedSubAssessments = assessmentItem.sub_assessments
            if (Array.isArray(assessmentItem.sub_assessments) && assessmentItem.sub_assessments.length > 0) {
              mappedSubAssessments = assessmentItem.sub_assessments
                .map((s: any) => {
                  const mappedSubId = bpjsToUmumSubMap.get(s.sub_indicator_id) || (s.code ? bpjsSubCodeToUmumSubMap.get(`${targetUmumIndId}:${s.code}`) : null)
                  // Skip sub-indicators that can't be mapped - don't insert BPJS sub_indicator_id into UMUM rows
                  if (!mappedSubId) return null
                  return {
                    ...s,
                    id: undefined,
                    sub_indicator_id: mappedSubId
                  }
                })
                .filter(Boolean)
            }

            const copyItem: Assessment = {
              ...assessmentItem,
              id: undefined,
              indicator_id: targetUmumIndId,
              revenue_type: 'umum',
              sub_assessments: mappedSubAssessments
            }
            const savedUmum = await upsertAssessment(adminClient, copyItem, existingMap)
            results.push(savedUmum)
          }
        } else {
          // Standard 'same' schema mode: same indicator_id
          const copyItem: Assessment = {
            ...assessmentItem,
            id: undefined,
            revenue_type: 'umum',
            sub_assessments: assessmentItem.sub_assessments?.map((s: any) => ({ ...s, id: undefined }))
          }
          const savedUmum = await upsertAssessment(adminClient, copyItem, existingMap)
          results.push(savedUmum)
        }
      }
    }

    // Insert notification into t_notification
    try {
      if (user?.id) {
        const periodName = itemsToProcess[0]?.period || ''
        await adminClient.from('t_notification').insert({
          user_id: user.id,
          title: 'Penilaian KPI Tersimpan',
          message: `Penilaian KPI untuk periode ${periodName} telah berhasil disimpan ke database.`,
          type: 'general',
          link: '/assessment',
          read: false
        })
      }
    } catch (notifErr) {
      console.warn('Failed to insert assessment notification:', notifErr)
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