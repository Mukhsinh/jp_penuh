import { createAdminClient } from '@/lib/supabase/server'
import { Role } from './rbac.service'
import { SupabaseClient } from '@supabase/supabase-js'

export interface DashboardStats {
  totalEmployees: number
  totalUnits: number
  avgScore: number
  completionRate: number
  trends: {
    employees: number
    score: number
    completion: number
  }
}

export interface EmployeeStats {
  score: number;
  rank: number;
  completionStatus: string;
  unitRank: string;
}

export interface TopPerformer {
  id: string
  name: string
  unit: string
  score: number
  rank: number
  avatar?: string
}

export interface UnitPerformance {
  id: string
  name: string
  avgScore: number
  completionRate: number
  employeeCount: number
}

export interface PerformanceTrend {
  month: string
  p1: number
  p2: number
  p3: number
  total: number
}

export interface KPIDistribution {
  name: string
  value: number
  color: string
}

export class DashboardService {
  /**
   * Helper to get resolved periods (current and previous)
   * When defaulting to current month but no data exists, falls back to latest available period
   */
  private static async getResolvedPeriods(supabase: SupabaseClient, period?: string, year?: string): Promise<string[]> {
    const currentYear = year || new Date().getFullYear().toString()

    // Default to current month if no period specified or if "month" is selected
    if (!period || period === 'month' || period === 'all') {
      const current = new Date()
      const currentPeriod = `${currentYear}-${String(current.getMonth() + 1).padStart(2, '0')}`

      // Check if data exists for current month
      const { count } = await supabase
        .from('t_kpi_assessments')
        .select('id', { count: 'exact', head: true })
        .eq('period', currentPeriod)

      if (count && count > 0) {
        return [currentPeriod]
      }

      // Fall back to the latest period that has data
      const { data: latestPeriod } = await supabase
        .from('t_kpi_assessments')
        .select('period')
        .like('period', `${currentYear}-%`)
        .order('period', { ascending: false })
        .limit(1)

      if (latestPeriod && latestPeriod.length > 0) {
        return [latestPeriod[0].period]
      }

      // If no data in current year at all, try previous year
      const prevYear = (parseInt(currentYear) - 1).toString()
      const { data: prevYearPeriod } = await supabase
        .from('t_kpi_assessments')
        .select('period')
        .like('period', `${prevYear}-%`)
        .order('period', { ascending: false })
        .limit(1)

      if (prevYearPeriod && prevYearPeriod.length > 0) {
        return [prevYearPeriod[0].period]
      }

      return [currentPeriod] // Fallback to current month if no data anywhere
    }

    // Handle Month format (M-01, M-02, etc.)
    if (period.startsWith('M-')) {
      const monthPart = period.split('-')[1]
      return [`${currentYear}-${monthPart}`]
    }

    // Handle Quarter format (Q-1, Q-2, etc.)
    if (period.startsWith('Q-')) {
      const q = parseInt(period.split('-')[1])
      const startMonth = (q - 1) * 3 + 1
      return [
        `${currentYear}-${String(startMonth).padStart(2, '0')}`,
        `${currentYear}-${String(startMonth + 1).padStart(2, '0')}`,
        `${currentYear}-${String(startMonth + 2).padStart(2, '0')}`
      ]
    }

    // Handle Semester format (S-1, S-2)
    if (period.startsWith('S-')) {
      const s = parseInt(period.split('-')[1])
      const startMonth = (s - 1) * 6 + 1
      return Array.from({ length: 6 }, (_, i) =>
        `${currentYear}-${String(startMonth + i).padStart(2, '0')}`
      )
    }

    // Handle full-year
    if (period === 'full-year') {
      return Array.from({ length: 12 }, (_, i) =>
        `${currentYear}-${String(i + 1).padStart(2, '0')}`
      )
    }

    return [period];
  }

  /**
   * Helper to get the latest available period for trend calculations
   */
  private static async getLatestAvailablePeriod(supabase: SupabaseClient): Promise<string | null> {
    const { data } = await supabase
      .from('t_kpi_assessments')
      .select('period')
      .order('period', { ascending: false })
      .limit(1)

    return data && data.length > 0 ? data[0].period : null
  }

  /**
   * Shared helper to calculate performance score using the standard formula
   * Standard Formula: Sum of ((Sum of Ind_Realisasi * Ind_Weight/100) / (Sum of Ind_Target * Ind_Weight/100)) * Cat_Weight
   */
  /**
   * Refined score calculation with fallback for unweighted categories
   */
  private static calculateScoreFromGroupedData(cats: { [key: string]: any[] }): number {
    let totalScore = 0;
    const catNames = ['P1', 'P2', 'P3'];

    for (const catName of catNames) {
      const catAssessments = cats[catName];
      if (!catAssessments || catAssessments.length === 0) continue;

      const firstAss = catAssessments[0];
      const indicator = (Array.isArray(firstAss.m_kpi_indicators) ? firstAss.m_kpi_indicators[0] : firstAss.m_kpi_indicators) as any;
      const categoryObj = indicator?.m_kpi_categories as any;

      const categoryWeight = parseFloat(Array.isArray(categoryObj) ? categoryObj[0]?.weight_percentage : categoryObj?.weight_percentage) || 0;
      const isWeighted = Array.isArray(categoryObj) ? categoryObj[0]?.is_weighted !== false : categoryObj?.is_weighted !== false;

      // Check if any indicator in this category has a weight
      const hasAnyIndicatorWeight = catAssessments.some((a: any) => parseFloat(a.weight_percentage) > 0);
      const effectivelyWeighted = isWeighted && (categoryWeight > 0 || hasAnyIndicatorWeight);

      if (effectivelyWeighted) {
        // Weighted calculation
        let totalRealisasi = 0;
        let totalTarget = 0;

        for (const a of catAssessments) {
          const indWeight = parseFloat(a.weight_percentage) || 0;
          totalRealisasi += (parseFloat(a.realization_value) || 0) * (indWeight / 100);
          totalTarget += (parseFloat(a.target_value) || 100) * (indWeight / 100);
        }

        if (totalTarget > 0) {
          totalScore += (totalRealisasi / totalTarget) * categoryWeight;
        }
      } else {
        // Unweighted fallback: average achievement % (Achievement = Realization/Target)
        let totalAchievement = 0;
        for (const a of catAssessments) {
          const r = parseFloat(a.realization_value) || 0;
          const t = parseFloat(a.target_value) || 100;
          totalAchievement += (t > 0 ? (r / t) : 0);
        }
        const avgAchievement = totalAchievement / catAssessments.length;
        totalScore += avgAchievement * categoryWeight;
      }
    }
    return totalScore;
  }

  /**
   * Shared helper to group assessments by employee ID
   */
  private static groupAssessmentsByEmployee(assessments: any[]): Map<string, { [key: string]: any[] }> {
    const empDataMap = new Map<string, { [key: string]: any[] }>();
    for (const a of assessments) {
      const empId = a.employee_id;
      if (!empDataMap.has(empId)) {
        empDataMap.set(empId, { P1: [], P2: [], P3: [] });
      }

      const indicator = (Array.isArray(a.m_kpi_indicators) ? a.m_kpi_indicators[0] : a.m_kpi_indicators) as any;
      const categoryObj = indicator?.m_kpi_categories;
      const catName = (Array.isArray(categoryObj) ? (categoryObj[0]?.category || categoryObj[0]?.name) : (categoryObj?.category || categoryObj?.name)) as string;

      const group = empDataMap.get(empId)!;
      if (catName && group[catName]) {
        group[catName].push(a);
      }
    }
    return empDataMap;
  }

  /**
   * Get dashboard statistics - enhanced with batching and robust calculations
   */
  static async getDashboardStats(unitId?: string, period?: string, year?: string): Promise<DashboardStats> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)

      // 1. Get employees to be assessed (non-superadmin, active, not in ADMIN unit)
      let empQuery = supabase
        .from('m_employees')
        .select('id, unit_id, m_units!inner(code)', { count: 'exact' })
        .eq('is_active', true)
        .neq('role', 'superadmin')
        .neq('m_units.code', 'ADMIN');

      if (unitId && unitId !== 'all') {
        empQuery = empQuery.eq('unit_id', unitId);
      }

      const { data: allEmployees, count: totalDisplayEmployees, error: empError } = await empQuery;
      if (empError) throw empError;

      const empIds = (allEmployees || []).map(e => e.id);

      // 2. Fetch assessments in batches of employees to avoid 1000 row limit / URL length issues
      const assessments: any[] = [];
      const batchSize = 25; // Small batch size because one employee can have many indicator rows

      for (let i = 0; i < empIds.length; i += batchSize) {
        const batch = empIds.slice(i, i + batchSize);
        const { data: batchData, error: batchError } = await supabase
          .from('t_kpi_assessments')
          .select(`
            employee_id,
            weight_percentage,
            realization_value,
            target_value,
            m_kpi_indicators (
              m_kpi_categories (
                category,
                weight_percentage,
                is_weighted
              )
            )
          `)
          .in('period', resolvedPeriods)
          .in('employee_id', batch)
          .range(0, 5000); // Fetch more than 1000 just in case

        if (batchError) {
          console.error(`[DashboardService] Error fetching batch ${i / batchSize}:`, batchError);
          continue;
        }
        if (batchData) assessments.push(...batchData);
      }

      // 3. Get total active units for context
      const { count: totalUnitsCount } = await supabase
        .from('m_units')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .neq('code', 'ADMIN');

      const totalUnits = (unitId && unitId !== 'all') ? 1 : (totalUnitsCount || 0);

      const empDataMap = this.groupAssessmentsByEmployee(assessments);
      const assessedEmployeeIds = Array.from(empDataMap.keys());
      const totalAssessed = assessedEmployeeIds.length;

      // Calculate average score across assessed employees
      const assessedScores = assessedEmployeeIds.map(empId => this.calculateScoreFromGroupedData(empDataMap.get(empId)!));
      const avgScore = totalAssessed > 0
        ? assessedScores.reduce((sum, score) => sum + score, 0) / totalAssessed
        : 0;

      const completionRate = (totalDisplayEmployees || 0) > 0
        ? (totalAssessed / (totalDisplayEmployees || 0)) * 100
        : 0;

      return {
        totalEmployees: totalDisplayEmployees || 0,
        totalUnits: totalUnits,
        avgScore: Math.round(avgScore * 100) / 100,
        completionRate: Math.round(completionRate * 10) / 10,
        trends: { employees: 0, score: 0, completion: 0 }
      }
    } catch (error: any) {
      console.error('Error in getDashboardStats:', error?.message || error)
      return this.getFallbackStats()
    }
  }

  private static getFallbackStats(): DashboardStats {
    return {
      totalEmployees: 0,
      totalUnits: 0,
      avgScore: 0,
      completionRate: 0,
      trends: { employees: 0, score: 0, completion: 0 }
    }
  }

  static async getTopPerformers(limit: number = 5, unitId?: string, period?: string, year?: string): Promise<TopPerformer[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)

      let query = supabase
        .from('t_kpi_assessments')
        .select(`
          employee_id,
          weight_percentage,
          realization_value,
          target_value,
          employee:m_employees!t_kpi_assessments_employee_id_fkey!inner (
            id, full_name, is_active, role,
            unit_id,
            m_units!m_employees_unit_id_fkey ( name )
          ),
          m_kpi_indicators!inner (
            m_kpi_categories!inner (
              category,
              weight_percentage
            )
          )
        `)
        .eq('employee.is_active', true)
        .neq('employee.role', 'superadmin')
        .in('period', resolvedPeriods)

      if (unitId && unitId !== 'all') {
        query = query.eq('employee.unit_id', unitId)
      }

      const { data: assessments, error } = await query
      if (error) throw error

      const empDataMap = new Map<string, { info: any, cats: { [key: string]: any[] } }>()
      for (const a of (assessments || [])) {
        const employeeData = Array.isArray(a.employee) ? a.employee[0] : a.employee
        const emp = employeeData as any
        if (!emp || !emp.is_active) continue

        const empId = emp.id
        if (!empDataMap.has(empId)) {
          empDataMap.set(empId, {
            info: {
              name: emp.full_name || 'Unknown',
              unit: emp.m_units?.name || 'Unknown'
            },
            cats: { P1: [], P2: [], P3: [] }
          })
        }

        const indicator = (Array.isArray(a.m_kpi_indicators) ? a.m_kpi_indicators[0] : a.m_kpi_indicators) as any;
        const categoryObj = indicator?.m_kpi_categories;
        const catName = (Array.isArray(categoryObj) ? categoryObj[0]?.category : categoryObj?.category) as string;

        if (catName && empDataMap.get(empId)!.cats[catName]) {
          empDataMap.get(empId)!.cats[catName].push(a)
        }
      }

      const performers: TopPerformer[] = Array.from(empDataMap.entries()).map(([id, data]) => ({
        id,
        name: data.info.name,
        unit: data.info.unit,
        score: this.calculateScoreFromGroupedData(data.cats),
        rank: 0
      }))

      return performers
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((p, i) => ({ ...p, rank: i + 1 }))
    } catch (error: any) {
      console.error('Error in getTopPerformers:', error?.message || error)
      return []
    }
  }

  static async getWorstPerformers(limit: number = 5, unitId?: string, period?: string, year?: string): Promise<TopPerformer[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)

      let query = supabase
        .from('t_kpi_assessments')
        .select(`
          employee_id,
          weight_percentage,
          realization_value,
          target_value,
          employee:m_employees!t_kpi_assessments_employee_id_fkey!inner (
            id, full_name, is_active, role,
            unit_id,
            m_units!m_employees_unit_id_fkey ( name )
          ),
          m_kpi_indicators!inner (
            m_kpi_categories!inner (
              category,
              weight_percentage
            )
          )
        `)
        .eq('employee.is_active', true)
        .neq('employee.role', 'superadmin')
        .in('period', resolvedPeriods)

      if (unitId && unitId !== 'all') {
        query = query.eq('employee.unit_id', unitId)
      }

      const { data: assessments, error } = await query
      if (error) throw error

      const empDataMap = new Map<string, { info: any, cats: { [key: string]: any[] } }>()
      for (const a of (assessments || [])) {
        const employeeData = Array.isArray(a.employee) ? a.employee[0] : a.employee
        const emp = employeeData as any
        if (!emp || !emp.is_active) continue

        const empId = emp.id
        if (!empDataMap.has(empId)) {
          empDataMap.set(empId, {
            info: {
              name: emp.full_name || 'Unknown',
              unit: emp.m_units?.name || 'Unknown'
            },
            cats: { P1: [], P2: [], P3: [] }
          })
        }

        const indicator = (Array.isArray(a.m_kpi_indicators) ? a.m_kpi_indicators[0] : a.m_kpi_indicators) as any;
        const categoryObj = indicator?.m_kpi_categories;
        const catName = (Array.isArray(categoryObj) ? categoryObj[0]?.category : categoryObj?.category) as string;

        if (catName && empDataMap.get(empId)!.cats[catName]) {
          empDataMap.get(empId)!.cats[catName].push(a)
        }
      }

      const performers: TopPerformer[] = Array.from(empDataMap.entries()).map(([id, data]) => ({
        id,
        name: data.info.name,
        unit: data.info.unit,
        score: this.calculateScoreFromGroupedData(data.cats),
        rank: 0
      }))

      return performers
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map((p, i) => ({ ...p, rank: i + 1 }))
    } catch (error: any) {
      console.error('Error in getWorstPerformers:', error?.message || error)
      return []
    }
  }

  static async getUnitPerformance(period?: string, year?: string): Promise<UnitPerformance[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)

      const { data: assessments, error } = await supabase
        .from('t_kpi_assessments')
        .select(`
          employee_id,
          realization_value,
          target_value,
          weight_percentage,
          employee:m_employees!t_kpi_assessments_employee_id_fkey!inner(
            id, is_active, role, unit_id,
            m_units!m_employees_unit_id_fkey(id, name)
          ),
          m_kpi_indicators (
            m_kpi_categories (
              category,
              weight_percentage
            )
          )
        `)
        .in('period', resolvedPeriods)
        .eq('employee.is_active', true)
        .neq('employee.role', 'superadmin')

      if (error) throw error

      // Group by Unit
      const unitDataMap = new Map<string, { name: string, employeeScores: Map<string, { [key: string]: any[] }>, totalDisplayEmps: number }>()

      // 1. Get total display employees per unit
      const { data: unitEmpsCount } = await supabase
        .from('m_employees')
        .select('unit_id, m_units(name)')
        .eq('is_active', true)
        .neq('role', 'superadmin')

      for (const e of (unitEmpsCount || []) as any[]) {
        if (!e.unit_id) continue
        if (!unitDataMap.has(e.unit_id)) {
          unitDataMap.set(e.unit_id, {
            name: (e.m_units as any)?.name || 'Unknown',
            employeeScores: new Map(),
            totalDisplayEmps: 0
          })
        }
        unitDataMap.get(e.unit_id)!.totalDisplayEmps++
      }

      // 2. Map assessments to units and employees
      for (const a of (assessments || []) as any[]) {
        const unitId = (Array.isArray(a.employee) ? a.employee[0]?.unit_id : a.employee?.unit_id)
        if (!unitId || !unitDataMap.has(unitId)) continue

        const empId = a.employee_id
        const unitGroup = unitDataMap.get(unitId)!
        if (!unitGroup.employeeScores.has(empId)) {
          unitGroup.employeeScores.set(empId, { P1: [], P2: [], P3: [] })
        }

        const indicator = (Array.isArray(a.m_kpi_indicators) ? a.m_kpi_indicators[0] : a.m_kpi_indicators) as any;
        const categoryObj = indicator?.m_kpi_categories;
        const catName = (Array.isArray(categoryObj) ? categoryObj[0]?.category : categoryObj?.category) as string;

        if (catName && unitGroup.employeeScores.get(empId)![catName]) {
          unitGroup.employeeScores.get(empId)![catName].push(a)
        }
      }

      return Array.from(unitDataMap.entries()).map(([id, data]) => {
        const assessedScores = Array.from(data.employeeScores.values()).map(cats => this.calculateScoreFromGroupedData(cats));
        const avgScore = assessedScores.length > 0
          ? assessedScores.reduce((s, score) => s + score, 0) / assessedScores.length
          : 0;

        const completionRate = data.totalDisplayEmps > 0
          ? (data.employeeScores.size / data.totalDisplayEmps) * 100
          : 0;

        return {
          id,
          name: data.name,
          avgScore: Math.round(avgScore * 100) / 100,
          completionRate: Math.round(completionRate * 10) / 10,
          employeeCount: data.totalDisplayEmps
        }
      }).sort((a, b) => b.avgScore - a.avgScore)

    } catch (error: any) {
      console.error('Error in getUnitPerformance:', error?.message || error)
      return []
    }
  }

  static async getPerformanceTrend(months: number = 6, unitId?: string, period?: string, year?: string): Promise<PerformanceTrend[]> {
    const supabase = await createAdminClient()

    try {
      // 1. Resolve months to fetch
      const periods: string[] = []
      // Use the provided period or get the latest from database
      let anchorPeriod: string | undefined = period;
      if (!anchorPeriod) {
        const latestAvailable = await this.getLatestAvailablePeriod(supabase)
        anchorPeriod = latestAvailable || undefined;
      }

      if (anchorPeriod) {
        const [y, m] = anchorPeriod.split('-').map(Number)
        for (let i = 0; i < months; i++) {
          const d = new Date(y, m - 1 - i, 1)
          periods.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }
      } else {
        const current = new Date()
        for (let i = 0; i < months; i++) {
          const d = new Date(current.getFullYear(), current.getMonth() - i, 1)
          periods.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }
      }

      // 2. Fetch assessments for all periods
      let q = supabase
        .from('t_kpi_assessments')
        .select(`
          period,
          employee_id,
          realization_value,
          target_value,
          weight_percentage,
          employee:m_employees!t_kpi_assessments_employee_id_fkey!inner(id, is_active, role, unit_id),
          m_kpi_indicators (
            m_kpi_categories (
              category,
              weight_percentage
            )
          )
        `)
        .in('period', periods)
        .eq('employee.is_active', true)
        .neq('employee.role', 'superadmin')

      if (unitId && unitId !== 'all') {
        q = q.eq('employee.unit_id', unitId)
      }

      const { data: assessments, error } = await q
      if (error) throw error

      // 3. Group by period then calculate scores
      return periods.map(p => {
        const pAss = (assessments || []).filter(a => a.period === p)
        if (pAss.length === 0) {
          return { month: p, p1: 0, p2: 0, p3: 0, total: 0 }
        }

        // Group by employee for this period
        const empMap = this.groupAssessmentsByEmployee(pAss)
        const scores = this.calculateAverageCategoryScores(empMap)

        return {
          month: p,
          p1: scores.p1,
          p2: scores.p2,
          p3: scores.p3,
          total: scores.total
        }
      })
    } catch (error: any) {
      console.error('Error in getPerformanceTrend:', error?.message || error)
      return []
    }
  }

  static async getKPIDistribution(unitId?: string, period?: string, year?: string): Promise<KPIDistribution[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)

      let query = supabase
        .from('t_kpi_assessments')
        .select(`
          employee_id,
          realization_value,
          target_value,
          weight_percentage,
          employee:m_employees!t_kpi_assessments_employee_id_fkey!inner(id, is_active, role, unit_id),
          m_kpi_indicators (
            m_kpi_categories (
              category,
              weight_percentage
            )
          )
        `)
        .in('period', resolvedPeriods)
        .eq('employee.is_active', true)
        .neq('employee.role', 'superadmin')

      if (unitId && unitId !== 'all') {
        query = query.eq('employee.unit_id', unitId)
      }

      const { data: assessments, error } = await query
      if (error) throw error

      const empMap = this.groupAssessmentsByEmployee((assessments || []) as any[])
      const scores = this.calculateAverageCategoryScores(empMap)

      return [
        { name: 'P1 (Posisi)', value: scores.p1, color: '#3b82f6' },
        { name: 'P2 (Kinerja)', value: scores.p2, color: '#10b981' },
        { name: 'P3 (Potensi)', value: scores.p3, color: '#f59e0b' }
      ]
    } catch (error: any) {
      console.error('Error in getKPIDistribution:', error?.message || error)
      return [
        { name: 'P1 (Posisi)', value: 0, color: '#3b82f6' },
        { name: 'P2 (Kinerja)', value: 0, color: '#10b981' },
        { name: 'P3 (Potensi)', value: 0, color: '#f59e0b' }
      ]
    }
  }

  /**
   * Calculates average scores across a group of employees for trend and distribution charts
   */
  private static calculateAverageCategoryScores(empMap: Map<string, any>) {
    if (empMap.size === 0) return { p1: 0, p2: 0, p3: 0, total: 0 }

    const employeeScores = Array.from(empMap.values()).map(empData => {
      const catScores: { [key: string]: number } = {}
      const cats = (empData as any).cats || empData;

      for (const [catName, catAss] of Object.entries(cats)) {
        const totalWeighted = (catAss as any[]).reduce((sum: number, a: any) => sum + ((a.weight_percentage || 0) / 100) * ((a.realization_value || 0) / (a.target_value || 1)), 0)
        const totalWeight = (catAss as any[]).reduce((sum: number, a: any) => sum + (a.weight_percentage || 0), 0)

        if (totalWeight > 0) {
          catScores[catName] = (totalWeighted / (totalWeight / 100)) * 100
        } else if ((catAss as any[]).length > 0) {
          const avgAch = (catAss as any[]).reduce((sum: number, a: any) => sum + ((a.realization_value || 0) / (a.target_value || 1)), 0) / (catAss as any[]).length
          catScores[catName] = avgAch * 100
        } else {
          catScores[catName] = 0
        }
      }

      return {
        p1: catScores['P1'] || catScores['p1'] || 0,
        p2: catScores['P2'] || catScores['p2'] || 0,
        p3: catScores['P3'] || catScores['p3'] || 0,
        total: this.calculateScoreFromGroupedData(cats)
      }
    })

    const avg = (key: 'p1' | 'p2' | 'p3' | 'total') =>
      employeeScores.reduce((sum: number, s: any) => sum + s[key], 0) / employeeScores.length

    return {
      p1: Math.round(avg('p1') * 100) / 100,
      p2: Math.round(avg('p2') * 100) / 100,
      p3: Math.round(avg('p3') * 100) / 100,
      total: Math.round(avg('total') * 100) / 100
    }
  }

  /**
   * Get statistics specifically for a single employee
   */
  static async getEmployeeStats(employeeId: string, period?: string, year?: string): Promise<EmployeeStats> {
    const supabase = await createAdminClient()
    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)

      // 1. Get employee data and unit context
      const { data: employee } = await supabase
        .from('m_employees')
        .select('unit_id')
        .eq('id', employeeId)
        .single()

      if (!employee) throw new Error('Employee not found')

      // 2. Get assessments for this employee
      const { data: assessments } = await supabase
        .from('t_kpi_assessments')
        .select(`
          realization_value,
          target_value,
          weight_percentage,
          m_kpi_indicators (
            m_kpi_categories (
              category,
              weight_percentage
            )
          )
        `)
        .eq('employee_id', employeeId)
        .in('period', resolvedPeriods)

      const empDataMap = new Map()
      empDataMap.set(employeeId, { P1: [], P2: [], P3: [] })
      const group = empDataMap.get(employeeId)

      for (const a of (assessments || [])) {
        const indicator = (Array.isArray(a.m_kpi_indicators) ? a.m_kpi_indicators[0] : a.m_kpi_indicators) as any;
        const categoryObj = indicator?.m_kpi_categories;
        const catName = (Array.isArray(categoryObj) ? categoryObj[0]?.category : categoryObj?.category) as string;
        if (catName && group[catName]) group[catName].push(a)
      }

      const score = this.calculateScoreFromGroupedData(group)

      // 3. Calculate rank in unit
      const topInUnit = await this.getTopPerformers(1000, employee.unit_id, period, year)
      const rank = topInUnit.findIndex(p => p.id === employeeId) + 1

      return {
        score: Math.round(score * 100) / 100,
        rank: rank || 0,
        completionStatus: assessments && assessments.length > 0 ? 'Selesai' : 'Belum Dinilai',
        unitRank: rank > 0 ? `${rank} dari ${topInUnit.length}` : '-'
      }
    } catch (error) {
      console.error('Error in getEmployeeStats:', error)
      return { score: 0, rank: 0, completionStatus: 'Error', unitRank: '-' }
    }
  }

  static async getRecentActivities() {
    const supabase = await createAdminClient()
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10)

      if (error) throw error
      return (data || []).map(audit => {
        const action = audit.action.toLowerCase()
        let type: 'create' | 'update' | 'delete' = 'update'
        if (action.includes('create') || action.includes('insert')) type = 'create'
        if (action.includes('delete') || action.includes('remove')) type = 'delete'

        const actionParts = audit.action.split(' ')
        const actionText = actionParts.length > 1 ? actionParts.slice(0, 2).join(' ') : audit.action

        return {
          id: audit.id,
          type,
          title: actionText,
          description: audit.details || 'No details',
          timestamp: new Date(audit.timestamp).toLocaleString('id-ID')
        }
      })
    } catch (error) {
      console.error('Exception in getRecentActivities:', error)
      return []
    }
  }
}
