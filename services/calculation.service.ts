'use server'

import { createClient } from '@/lib/supabase/server'
import Decimal from 'decimal.js'
import {
  calculateIndividualScore,
  calculateUnitAllocation,
  calculateIndividualIncentive,
  calculateNetIncentive,
  calculateAchievementPercentage,
  calculateWeightedIndicatorScore,
  aggregateCategoryScore,
  calculateActivityRupiah,
  toNumber,
} from '@/lib/formulas/kpi-calculator'

interface IndicatorRealization {
  indicator_id: string
  sub_indicator_id?: string | null
  realization_value: number
  target_value: number
  weight_percentage: number
  category: 'P1' | 'P2' | 'P3'
  is_activity: boolean
  basic_index_value: number
  measurement_type: 'scoring' | 'quantitative'
  unit_tariff: number
}

interface ValidationError {
  type: string
  message: string
  details?: any
}

interface CalculationPrerequisites {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Calculate individual scores for all employees in a period
 * Now supports both assessment data (t_kpi_assessments) and realization data (t_realization)
 * Priority: Assessment data > Realization data
 */
export async function calculateIndividualScores(period: string) {
  const supabase = await createClient()

  const results = []

  // Use batch query to eliminate N+1 problem
  const { dataFetcher } = await import('@/lib/utils/data-fetcher')
  let employeesWithKPIData: any[] = []

  try {
    const { data, error } = await dataFetcher.getEmployeesWithKPIData(null, period)
    if (error) throw error
    employeesWithKPIData = data || []
  } catch (err) {
    console.error('Error fetching employees with KPI data:', err)
    throw new Error(`Failed to fetch employee KPI data: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  for (const employee of employeesWithKPIData) {
    // Process assessment data (preferred) or fallback to realization data
    let dataSource = 'assessment'
    let employeeData: any[] = employee.t_kpi_assessments || []

    if (!employeeData || employeeData.length === 0) {
      dataSource = 'realization'
      employeeData = employee.t_realization || []
    }

    // Group by category (P1, P2, P3)
    const p1Indicators: IndicatorRealization[] = []
    const p2Indicators: IndicatorRealization[] = []
    const p3Indicators: IndicatorRealization[] = []

    employeeData.forEach((r: any) => {
      const indicator = r.m_kpi_indicators
      const subIndicator = r.m_kpi_sub_indicators
      let category: string
      let targetValue: number
      let weightPercentage: number

      if (dataSource === 'assessment') {
        category = indicator.m_kpi_categories.category
        targetValue = r.target_value
        weightPercentage = r.weight_percentage
      } else {
        category = indicator.m_kpi_categories.category
        targetValue = indicator.target_value
        weightPercentage = indicator.weight_percentage
      }

      const data: IndicatorRealization = {
        indicator_id: r.indicator_id,
        sub_indicator_id: r.sub_indicator_id,
        realization_value: r.realization_value,
        target_value: targetValue,
        weight_percentage: weightPercentage,
        category: category as 'P1' | 'P2' | 'P3',
        is_activity: indicator.calculation_method === 'priority',
        basic_index_value: subIndicator?.base_index_value || indicator.basic_index_value || 0,
        measurement_type: subIndicator?.measurement_type || 'scoring',
        unit_tariff: subIndicator?.unit_tariff || 0
      }

      if (category === 'P1') p1Indicators.push(data)
      else if (category === 'P2') p2Indicators.push(data)
      else if (category === 'P3') p3Indicators.push(data)
    })

    // Calculate scores for each indicator
    const calculateCategoryMetrics = (indicators: IndicatorRealization[]) => {
      let totalIndexScore = 0
      let totalActivityRupiah = 0

      const scores = indicators.map(ind => {
        // Quantitative logic: Score = Realization * BaseIndexValue / Tariff
        if (ind.measurement_type === 'quantitative') {
          if (ind.is_activity) {
            // Berbasis Aktivitas: Direct Rupiah (Volume * Tariff)
            const actRupiah = new Decimal(ind.realization_value).mul(ind.unit_tariff)
            totalActivityRupiah += actRupiah.toNumber()
            return 0
          } else {
            // Berbasis Indeks: Convert Volume to "Index Points" 
            // Score = Realization * BaseIndexValue
            const indexPoints = new Decimal(ind.realization_value).mul(ind.basic_index_value)
            return indexPoints.toNumber()
          }
        }

        // Standard Scoring logic (0-100)
        const achievement = calculateAchievementPercentage(ind.realization_value, ind.target_value)
        const weighted = calculateWeightedIndicatorScore(toNumber(achievement), ind.weight_percentage)

        if (ind.is_activity) {
          // If activity-based but using scoring (unlikely but supported)
          const actRupiah = calculateActivityRupiah(ind.realization_value, ind.basic_index_value)
          totalActivityRupiah += actRupiah.toNumber()
          return 0
        }

        return toNumber(weighted)
      })

      totalIndexScore = toNumber(aggregateCategoryScore(scores))
      return { totalIndexScore, totalActivityRupiah }
    }

    const p1Metrics = calculateCategoryMetrics(p1Indicators)
    const p2Metrics = calculateCategoryMetrics(p2Indicators)
    const p3Metrics = calculateCategoryMetrics(p3Indicators)

    const combinedActivityRupiah = p1Metrics.totalActivityRupiah + p2Metrics.totalActivityRupiah + p3Metrics.totalActivityRupiah

    // Get category weights for this unit
    const { data: categories } = await supabase
      .from('m_kpi_categories')
      .select('category, weight_percentage')
      .eq('unit_id', employee.unit_id)
      .eq('is_active', true)

    const weights = {
      p1: categories?.find(c => c.category === 'P1')?.weight_percentage || 0,
      p2: categories?.find(c => c.category === 'P2')?.weight_percentage || 0,
      p3: categories?.find(c => c.category === 'P3')?.weight_percentage || 0,
    }

    // Calculate weighted individual score
    const individualScores = calculateIndividualScore(
      p1Metrics.totalIndexScore,
      p2Metrics.totalIndexScore,
      p3Metrics.totalIndexScore,
      weights,
      combinedActivityRupiah
    )

    // Upsert to t_individual_scores with data source metadata
    const { error: upsertError } = await supabase
      .from('t_individual_scores')
      .upsert({
        employee_id: employee.id,
        period,
        p1_score: toNumber(individualScores.p1Score),
        p2_score: toNumber(individualScores.p2Score),
        p3_score: toNumber(individualScores.p3Score),
        p1_weighted: toNumber(individualScores.p1Weighted),
        p2_weighted: toNumber(individualScores.p2Weighted),
        p3_weighted: toNumber(individualScores.p3Weighted),
        individual_total_score: toNumber(individualScores.totalIndividualScore),
        activity_rupiah: toNumber(individualScores.activityRupiah),
        individual_weight_percentage: 100, // Default, can be customized
        weighted_individual_score: toNumber(individualScores.totalIndividualScore),
        calculation_metadata: {
          data_source: dataSource,
          calculated_at: new Date().toISOString(),
          has_assessment_data: dataSource === 'assessment',
          assessment_count: dataSource === 'assessment' ? employeeData?.length : 0,
          realization_count: dataSource === 'realization' ? employeeData?.length : 0,
        },
      }, {
        onConflict: 'employee_id,period'
      })

    if (upsertError) throw upsertError

    results.push({
      employee_id: employee.id,
      data_source: dataSource,
      ...individualScores,
    })
  }

  return results
}

/**
 * Get assessment data aggregated by employee for a period
 * Used for reporting and validation purposes
 */
export async function getAssessmentDataSummary(period: string) {
  const supabase = await createClient()

  const { data: summary, error } = await supabase
    .from('t_kpi_assessments')
    .select(`
      employee_id,
      m_employees!inner (
        full_name,
        unit_id,
        m_units!inner (
          name
        )
      ),
      indicator_id,
      m_kpi_indicators!inner (
        name,
        category_id,
        m_kpi_categories!inner (
          category,
          category_name
        )
      ),
      realization_value,
      target_value,
      achievement_percentage,
      score,
      assessor_id,
      created_at,
      updated_at
    `)
    .eq('period', period)
    .order('m_employees.full_name, m_kpi_categories.category, m_kpi_indicators.name')

  if (error) throw error

  return summary || []
}

/**
 * Check if assessment data exists for a period
 * Used to determine calculation data source priority
 */
export async function hasAssessmentData(period: string): Promise<boolean> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('t_kpi_assessments')
    .select('*', { count: 'exact', head: true })
    .eq('period', period)

  if (error) throw error

  return (count || 0) > 0
}

/**
 * Get mixed data source summary for a period
 * Shows which employees have assessment vs realization data
 */
export async function getDataSourceSummary(period: string) {
  const supabase = await createClient()

  // Get all active employees
  const { data: employees, error: empError } = await supabase
    .from('m_employees')
    .select(`
      id,
      full_name,
      unit_id,
      m_units!inner (
        name
      )
    `)
    .eq('is_active', true)

  if (empError) throw empError

  const summary = []

  for (const employee of employees!) {
    // Check assessment data
    const { count: assessmentCount } = await supabase
      .from('t_kpi_assessments')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .eq('period', period)

    // Check realization data
    const { count: realizationCount } = await supabase
      .from('t_realization')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .eq('period', period)

    summary.push({
      employee_id: employee.id,
      full_name: employee.full_name,
      unit_id: employee.unit_id,
      unit_name: (employee.m_units as any).name,
      assessment_count: assessmentCount || 0,
      realization_count: realizationCount || 0,
      primary_data_source: (assessmentCount || 0) > 0 ? 'assessment' : 'realization',
      has_mixed_data: (assessmentCount || 0) > 0 && (realizationCount || 0) > 0,
    })
  }

  return summary
}

/**
 * Calculate final distribution for all employees
 * Requirements: 11.4, 11.5, 11.6
 */
export async function calculateFinalDistribution(period: string) {
  const supabase = await createClient()

  // Get pool for this period
  const { data: pool, error: poolError } = await supabase
    .from('t_pool')
    .select('*')
    .eq('period', period)
    .single()

  if (poolError) throw poolError
  if (!pool) throw new Error('Pool not found for this period')
  if (pool.allocated_amount === null || pool.allocated_amount === undefined) {
    throw new Error('Pool allocated amount is not calculated. Please ensure pool has revenue and deduction data.')
  }

  // Get all units with their proportions
  const { data: units, error: unitsError } = await supabase
    .from('m_units')
    .select('id, proportion_percentage')
    .eq('is_active', true)

  if (unitsError) throw unitsError

  const results = []

  for (const unit of units!) {
    // Calculate unit allocation
    const unitAllocation = calculateUnitAllocation(
      pool.allocated_amount,
      unit.proportion_percentage
    )

    // Update unit score with allocated amount
    await supabase
      .from('t_unit_scores')
      .update({
        unit_allocated_amount: toNumber(unitAllocation),
      })
      .eq('unit_id', unit.id)
      .eq('period', period)

    // Get all employees in this unit with their scores
    const { data: employees, error: empError } = await supabase
      .from('m_employees')
      .select(`
        id,
        tax_status,
        t_individual_scores!inner (
          individual_total_score,
          activity_rupiah
        )
      `)
      .eq('unit_id', unit.id)
      .eq('is_active', true)
      .eq('t_individual_scores.period', period)

    if (empError) throw empError

    // Calculate total unit activity-based rupiah
    const totalUnitActivityRupiah = employees!.reduce((sum, emp: any) => {
      return sum + (Number(emp.t_individual_scores[0].activity_rupiah) || 0)
    }, 0)

    // Calculate total unit scores (for distributing the remainder)
    const totalUnitScores = employees!.reduce((sum, emp: any) => {
      return sum + emp.t_individual_scores[0].individual_total_score
    }, 0)

    // Calculate PIR (Proportion Index Ratio) for this unit
    const { calculatePIR } = await import('@/lib/formulas/kpi-calculator')
    const pirValue = calculatePIR(
      toNumber(unitAllocation),
      totalUnitActivityRupiah,
      totalUnitScores
    )

    // Distribute to each employee
    for (const employee of employees!) {
      const empScore = (employee as any).t_individual_scores[0].individual_total_score
      const empActivityRupiah = (employee as any).t_individual_scores[0].activity_rupiah || 0

      // Calculate incentive using the new PIR-aware function
      const { proportion, grossIncentive, indexIncentive, activityIncentive } = calculateIndividualIncentive(
        toNumber(unitAllocation),
        empScore,
        totalUnitScores,
        empActivityRupiah,
        toNumber(pirValue)
      )

      // Calculate tax and net incentive
      const incentiveDistribution = calculateNetIncentive(
        toNumber(grossIncentive),
        employee.tax_status
      )

      // Save to t_calculation_results with 2 decimal places for monetary amounts
      const { error: calcError } = await supabase
        .from('t_calculation_results')
        .upsert({
          employee_id: employee.id,
          period,
          pool_id: pool.id,
          unit_score: totalUnitScores,
          individual_score: empScore,
          final_score: empScore,
          unit_allocated_amount: toNumber(unitAllocation),
          score_proportion: toNumber(proportion),
          activity_based_incentive: toNumber(new Decimal(empActivityRupiah)),
          index_based_incentive: toNumber(indexIncentive),
          gross_incentive: toNumber(incentiveDistribution.grossIncentive),
          tax_amount: toNumber(incentiveDistribution.taxAmount),
          net_incentive: toNumber(incentiveDistribution.netIncentive),
          calculation_metadata: {
            unit_id: unit.id,
            total_unit_scores: totalUnitScores,
            total_unit_activity_rupiah: totalUnitActivityRupiah,
            pir_value: toNumber(pirValue),
            calculated_at: new Date().toISOString(),
          },
        }, {
          onConflict: 'employee_id,period'
        })

      if (calcError) throw calcError

      results.push({
        employee_id: employee.id,
        gross_incentive: toNumber(incentiveDistribution.grossIncentive),
        tax_amount: toNumber(incentiveDistribution.taxAmount),
        net_incentive: toNumber(incentiveDistribution.netIncentive),
      })
    }
  }

  return results
}

/**
 * Run full calculation pipeline for a period with transaction management
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
 */
export async function runFullCalculation(period: string) {
  const startTime = new Date()
  const supabase = await createClient()

  try {
    // Step 1: Validate prerequisites
    const validation = await validateCalculationPrerequisites(period)
    if (!validation.valid) {
      const errorMessage = validation.errors.map(e => e.message).join('; ')
      await logCalculation({
        period,
        status: 'error',
        error_message: errorMessage,
        start_time: startTime,
        end_time: new Date(),
      })

      return {
        success: false,
        message: 'Validation failed',
        errors: validation.errors,
      }
    }

    // Get employee count for logging (excluding superadmin and ADMIN unit)
    const { count: employeeCount } = await supabase
      .from('m_employees')
      .select('id, m_units!inner(code)', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('role', 'superadmin')
      .neq('m_units.code', 'ADMIN')

    // Step 2: Calculate individual scores (P1, P2, P3)
    await calculateIndividualScores(period)

    // Step 3: Calculate and store unit scores
    await calculateAndStoreUnitScores(period)

    // Step 4: Calculate final distribution
    await calculateFinalDistribution(period)

    // Log success
    await logCalculation({
      period,
      status: 'success',
      employee_count: employeeCount || 0,
      start_time: startTime,
      end_time: new Date(),
    })

    return {
      success: true,
      message: 'Calculation completed successfully',
      employee_count: employeeCount || 0,
    }
  } catch (error: any) {
    console.error('Calculation error:', error)

    // Log error
    await logCalculation({
      period,
      status: 'error',
      error_message: (error as Error).message,
      error_stack: (error as Error).stack,
      start_time: startTime,
      end_time: new Date(),
    })

    return {
      success: false,
      message: 'Calculation failed: ' + (error as Error).message,
    }
  }
}

/**
 * Validate calculation prerequisites
 * Requirements: 11.1, 11.2
 */
async function validateCalculationPrerequisites(period: string): Promise<CalculationPrerequisites> {
  const supabase = await createClient()
  const errors: ValidationError[] = []

  // 1. Check if pool exists and is approved
  const { data: pool, error: poolError } = await supabase
    .from('t_pool')
    .select('*')
    .eq('period', period)
    .eq('status', 'approved')
    .single()

  if (poolError || !pool) {
    errors.push({
      type: 'pool_not_approved',
      message: `Pool for period ${period} is not approved or does not exist`,
    })
  }

  // 2. Check if all active employees have assessment or realization data
  const { data: employees } = await supabase
    .from('m_employees')
    .select('id, full_name, unit_id')
    .eq('is_active', true)

  if (employees) {
    for (const employee of employees) {
      // Get required indicators for this employee's unit
      const { data: indicators } = await supabase
        .from('m_kpi_indicators')
        .select('id, name, category_id, m_kpi_categories!inner(unit_id)')
        .eq('is_active', true)
        .eq('m_kpi_categories.unit_id', employee.unit_id)

      if (indicators) {
        for (const indicator of indicators) {
          // Check assessment data first
          const { data: assessment } = await supabase
            .from('t_kpi_assessments')
            .select('id')
            .eq('employee_id', employee.id)
            .eq('indicator_id', indicator.id)
            .eq('period', period)
            .single()

          // If no assessment, check realization data
          if (!assessment) {
            const { data: realization } = await supabase
              .from('t_realization')
              .select('id')
              .eq('employee_id', employee.id)
              .eq('indicator_id', indicator.id)
              .eq('period', period)
              .single()

            if (!realization) {
              errors.push({
                type: 'missing_data',
                message: `Missing assessment or realization data for employee ${employee.full_name}, indicator ${indicator.name}`,
                details: { employee_id: employee.id, indicator_id: indicator.id },
              })
            }
          }
        }
      }
    }
  }

  // 3. Validate category weights sum to 100% per unit
  const { data: units } = await supabase
    .from('m_units')
    .select('id, name')
    .eq('is_active', true)

  if (units) {
    for (const unit of units) {
      const { data: categories } = await supabase
        .from('m_kpi_categories')
        .select('weight_percentage')
        .eq('unit_id', unit.id)
        .eq('is_active', true)

      if (categories) {
        const totalWeight = categories.reduce((sum, cat) => sum + cat.weight_percentage, 0)
        const tolerance = 0.01

        if (Math.abs(totalWeight - 100) > tolerance) {
          errors.push({
            type: 'invalid_category_weights',
            message: `Category weights for unit ${unit.name} sum to ${totalWeight}%, expected 100%`,
            details: { unit_id: unit.id, total_weight: totalWeight },
          })
        }
      }
    }
  }

  // 4. Validate indicator weights sum to 100% per category
  const { data: categories } = await supabase
    .from('m_kpi_categories')
    .select('id, category_name, unit_id')
    .eq('is_active', true)

  if (categories) {
    for (const category of categories) {
      const { data: indicators } = await supabase
        .from('m_kpi_indicators')
        .select('weight_percentage')
        .eq('category_id', category.id)
        .eq('is_active', true)

      if (indicators) {
        const totalWeight = indicators.reduce((sum, ind) => sum + ind.weight_percentage, 0)
        const tolerance = 0.01

        if (Math.abs(totalWeight - 100) > tolerance) {
          errors.push({
            type: 'invalid_indicator_weights',
            message: `Indicator weights for category ${category.category_name} sum to ${totalWeight}%, expected 100%`,
            details: { category_id: category.id, total_weight: totalWeight },
          })
        }
      }
    }
  }

  // 5. Validate unit proportions sum to 100%
  if (units) {
    const { data: allUnits } = await supabase
      .from('m_units')
      .select('proportion_percentage')
      .eq('is_active', true)

    if (allUnits) {
      const totalProportion = allUnits.reduce((sum, unit) => sum + unit.proportion_percentage, 0)
      const tolerance = 0.01

      if (Math.abs(totalProportion - 100) > tolerance) {
        errors.push({
          type: 'invalid_unit_proportions',
          message: `Unit proportions sum to ${totalProportion}%, expected 100%`,
          details: { total_proportion: totalProportion },
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Log calculation to t_calculation_log
 * Requirements: 11.6, 11.7
 */
async function logCalculation(data: {
  period: string
  status: 'success' | 'error'
  employee_count?: number
  error_message?: string
  error_stack?: string
  start_time: Date
  end_time: Date
}) {
  const supabase = await createClient()

  await supabase.from('t_calculation_log').insert({
    period: data.period,
    status: data.status,
    employee_count: data.employee_count || 0,
    error_message: data.error_message,
    error_details: data.error_stack ? { stack: data.error_stack } : null,
    started_at: data.start_time.toISOString(),
    completed_at: data.end_time.toISOString(),
  })
}

/**
 * Calculate unit scores and store in t_unit_scores
 * Requirements: 11.3
 */
async function calculateAndStoreUnitScores(period: string) {
  const supabase = await createClient()

  const { data: units } = await supabase
    .from('m_units')
    .select('id, proportion_percentage')
    .eq('is_active', true)

  if (!units) return

  for (const unit of units) {
    // Get all employees in this unit
    const { data: employees } = await supabase
      .from('m_employees')
      .select(`
        id,
        t_individual_scores!inner (
          individual_total_score
        )
      `)
      .eq('unit_id', unit.id)
      .eq('is_active', true)
      .eq('t_individual_scores.period', period)

    if (!employees || employees.length === 0) continue

    // Sum all individual scores
    const totalScore = employees.reduce((sum, emp: any) => {
      return sum + (emp.t_individual_scores[0]?.individual_total_score || 0)
    }, 0)

    // Store unit score
    await supabase
      .from('t_unit_scores')
      .upsert({
        unit_id: unit.id,
        period,
        total_score: totalScore,
        unit_weight_percentage: unit.proportion_percentage,
      }, {
        onConflict: 'unit_id,period'
      })
  }
}
