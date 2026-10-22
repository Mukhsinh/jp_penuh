import { createAdminClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { calculateCategoryScore, calculateTotalScore } from '@/lib/utils/score-calculator'
import { isMedicalUnit } from '@/lib/utils/medical-unit'

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

interface EmployeeAssessmentAggregate {
  id: string
  name: string
  unitId: string
  unitName: string
  isMedical: boolean
  p1_scores: number[]
  p2_scores: number[]
  p3_scores: number[]
  hasAssessments: boolean
  p1?: number
  p2?: number
  p3?: number
  total?: number
}

// In-memory caches to speed up parallel dashboard queries
const assessmentsCache = new Map<string, { data: any[]; timestamp: number }>()
const employeesCache = new Map<string, { data: any[]; timestamp: number }>()
const CACHE_TTL_MS = 30 * 1000 // 30 seconds

export class DashboardService {
  /**
   * Helper to get the latest period with substantial assessment data (e.g. 2026-01)
   */
  public static async getLatestPeriodWithData(supabase: SupabaseClient): Promise<string> {
    const currentYear = new Date().getFullYear().toString()

    try {
      const { data: assessments } = await supabase
        .from('t_kpi_assessments')
        .select('period')
        .order('period', { ascending: false })

      if (assessments && assessments.length > 0) {
        const counts: Record<string, number> = {}
        for (const a of assessments) {
          if (a.period) counts[a.period] = (counts[a.period] || 0) + 1
        }

        const sortedPeriods = Object.keys(counts).sort((a, b) => b.localeCompare(a))

        // Prefer the latest period that has at least 100 assessments
        for (const p of sortedPeriods) {
          if (counts[p] >= 100) return p
        }

        // Fallback to period with maximum assessment count
        let maxP = sortedPeriods[0]
        let maxC = 0
        for (const p of sortedPeriods) {
          if (counts[p] > maxC) {
            maxC = counts[p]
            maxP = p
          }
        }
        if (maxP) return maxP
      }
    } catch (e) {
      console.warn('[DashboardService] getLatestPeriodWithData error:', e)
    }

    return `${currentYear}-01`
  }

  /**
   * Returns default period filter key (e.g. 'M-01') for the initial dashboard view
   */
  public static async getDefaultPeriodKey(supabase: SupabaseClient): Promise<string> {
    const latestPeriod = await this.getLatestPeriodWithData(supabase)
    if (latestPeriod && latestPeriod.includes('-')) {
      const monthPart = latestPeriod.split('-')[1]
      return `M-${monthPart}`
    }
    return 'M-01'
  }

  /**
   * Resolves filter period string into array of YYYY-MM periods
   */
  public static async getResolvedPeriods(supabase: SupabaseClient, period?: string, year?: string): Promise<string[]> {
    const currentYear = year || new Date().getFullYear().toString()

    // When defaulting to current month, check if current month has substantial data; otherwise fallback to latest period with data
    if (!period || period === 'month' || period === 'all') {
      const current = new Date()
      const currentPeriod = `${currentYear}-${String(current.getMonth() + 1).padStart(2, '0')}`

      const { count } = await supabase
        .from('t_kpi_assessments')
        .select('id', { count: 'exact', head: true })
        .eq('period', currentPeriod)

      // If current month has substantial assessments (at least 100 rows), use it
      if (count && count >= 100) {
        return [currentPeriod]
      }

      // Fall back to latest period that has data (e.g. 2026-01)
      const latest = await this.getLatestPeriodWithData(supabase)
      return [latest]
    }

    // Handle Month format (M-01, M-02, ..., M-12)
    if (period.startsWith('M-')) {
      const monthPart = period.split('-')[1]
      return [`${currentYear}-${monthPart.padStart(2, '0')}`]
    }

    // Handle Quarter format (Q-1, Q-2, Q-3, Q-4)
    if (period.startsWith('Q-')) {
      const q = parseInt(period.split('-')[1], 10) || 1
      const startMonth = (q - 1) * 3 + 1
      return [
        `${currentYear}-${String(startMonth).padStart(2, '0')}`,
        `${currentYear}-${String(startMonth + 1).padStart(2, '0')}`,
        `${currentYear}-${String(startMonth + 2).padStart(2, '0')}`
      ]
    }

    // Handle Semester format (S-1, S-2)
    if (period.startsWith('S-')) {
      const s = parseInt(period.split('-')[1], 10) || 1
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

    // Standard YYYY-MM
    return [period]
  }

  /**
   * Helper to fetch active non-admin employees
   */
  private static async getValidEmployees(supabase: SupabaseClient, unitId?: string) {
    const cacheKey = unitId || 'all'
    const cached = employeesCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.data
    }

    let query = supabase
      .from('m_employees')
      .select('id, full_name, unit_id, role, m_units!unit_id(id, name, code)')
      .eq('is_active', true)
      .neq('role', 'superadmin')

    if (unitId && unitId !== 'all') {
      query = query.eq('unit_id', unitId)
    }

    const { data: rawEmployees, error } = await query
    if (error) {
      console.error('[DashboardService] getValidEmployees error:', error)
      return []
    }

    const result = (rawEmployees || []).filter((e: any) => {
      const u = Array.isArray(e.m_units) ? e.m_units[0] : e.m_units
      const code = String(u?.code || '').toUpperCase()
      const name = String(u?.name || '').toUpperCase()
      return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
    })

    employeesCache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
  }

  /**
   * Paginated assessment fetcher across periods (pageSize = 1000 to respect Supabase API limits)
   */
  private static async fetchAssessmentsForPeriods(
    supabase: SupabaseClient,
    periods: string[],
    filterEmployeeIds?: string[]
  ): Promise<any[]> {
    if (!periods || periods.length === 0) return []

    const cacheKey = periods.slice().sort().join(',') + ':' + (filterEmployeeIds && filterEmployeeIds.length <= 100 ? filterEmployeeIds.sort().join(',') : 'all')
    const cached = assessmentsCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      if (filterEmployeeIds && filterEmployeeIds.length > 100) {
        const allowedSet = new Set(filterEmployeeIds)
        return cached.data.filter(a => allowedSet.has(a.employee_id))
      }
      return cached.data
    }

    const allAssessments: any[] = []
    const pageSize = 1000
    let from = 0

    while (true) {
      let q = supabase
        .from('t_kpi_assessments')
        .select(`
          employee_id,
          indicator_id,
          sub_indicator_id,
          score,
          realization_value,
          revenue_type,
          period,
          m_kpi_indicators (
            calculation_method,
            m_kpi_categories (
              category
            )
          )
        `)
        .in('period', periods)
        .order('id')
        .range(from, from + pageSize - 1)

      if (filterEmployeeIds && filterEmployeeIds.length > 0 && filterEmployeeIds.length <= 100) {
        q = q.in('employee_id', filterEmployeeIds)
      }

      const { data, error } = await q
      if (error || !data || data.length === 0) break

      allAssessments.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }

    assessmentsCache.set(cacheKey, { data: allAssessments, timestamp: Date.now() })

    if (filterEmployeeIds && filterEmployeeIds.length > 100) {
      const allowedSet = new Set(filterEmployeeIds)
      return allAssessments.filter(a => allowedSet.has(a.employee_id))
    }

    return allAssessments
  }

  /**
   * Calculates canonical employee scores adhering strictly to lib/utils/score-calculator.ts
   */
  private static calculateEmployeeScores(
    employees: any[],
    assessments: any[]
  ): EmployeeAssessmentAggregate[] {
    const empMap = new Map<string, EmployeeAssessmentAggregate>()

    for (const e of employees) {
      const u = Array.isArray(e.m_units) ? e.m_units[0] : e.m_units
      empMap.set(e.id, {
        id: e.id,
        name: e.full_name || 'N/A',
        unitId: e.unit_id,
        unitName: u?.name || 'Unknown',
        isMedical: isMedicalUnit(e.unit_id, u?.name),
        p1_scores: [],
        p2_scores: [],
        p3_scores: [],
        hasAssessments: false
      })
    }

    // Deduplicate assessments per indicator and sub_indicator (e.g. between bpjs and umum)
    const dedupeMap = new Map<string, { empId: string; cat: string; score: number }>()

    for (const a of assessments) {
      if (!empMap.has(a.employee_id)) continue

      const ind = Array.isArray(a.m_kpi_indicators) ? a.m_kpi_indicators[0] : a.m_kpi_indicators
      // Strictly exclude priority indicators (indices like Rp 300.000 or Rp 1.000.000) from KPI performance score
      if (ind?.calculation_method === 'priority') continue

      const catObj = Array.isArray(ind?.m_kpi_categories) ? ind?.m_kpi_categories[0] : ind?.m_kpi_categories
      const cat = (catObj?.category || '').toLowerCase()

      // Assessed KPI score: realization_value is the primary assessed value, fallback to score
      const scoreVal = (a.realization_value !== null && a.realization_value !== undefined && Number(a.realization_value) > 0)
        ? Number(a.realization_value)
        : Number(a.score || 0)

      const key = `${a.employee_id}:${a.indicator_id}:${a.sub_indicator_id || 'main'}`
      if (!dedupeMap.has(key) || (scoreVal > 0 && dedupeMap.get(key)!.score === 0)) {
        dedupeMap.set(key, {
          empId: a.employee_id,
          cat,
          score: scoreVal
        })
      }
    }

    // Populate category scores
    for (const item of Array.from(dedupeMap.values())) {
      const emp = empMap.get(item.empId)
      if (!emp) continue
      emp.hasAssessments = true
      if (item.cat === 'p1') emp.p1_scores.push(item.score)
      else if (item.cat === 'p2') emp.p2_scores.push(item.score)
      else if (item.cat === 'p3') emp.p3_scores.push(item.score)
    }

    // Compute standard scores using score-calculator.ts
    const result: EmployeeAssessmentAggregate[] = []
    for (const emp of Array.from(empMap.values())) {
      if (!emp.hasAssessments) {
        emp.p1 = 0
        emp.p2 = 0
        emp.p3 = 0
        emp.total = 0
      } else {
        const p1 = calculateCategoryScore(emp.p1_scores, emp.isMedical)
        const p2 = calculateCategoryScore(emp.p2_scores, emp.isMedical)
        const p3 = calculateCategoryScore(emp.p3_scores, emp.isMedical)
        const total = calculateTotalScore(p1, p2, p3, emp.isMedical)

        emp.p1 = Math.round(p1 * 100) / 100
        emp.p2 = Math.round(p2 * 100) / 100
        emp.p3 = Math.round(p3 * 100) / 100
        emp.total = Math.round(total * 100) / 100
      }
      result.push(emp)
    }

    return result
  }

  /**
   * Get main dashboard statistics: Rata-rata Skor, Tingkat Penyelesaian, Total Pegawai, Total Unit
   */
  static async getDashboardStats(unitId?: string, period?: string, year?: string): Promise<DashboardStats> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)
      const validEmployees = await this.getValidEmployees(supabase, unitId)
      const totalEmployees = validEmployees.length
      const empIds = validEmployees.map((e: any) => e.id)

      const assessments = await this.fetchAssessmentsForPeriods(supabase, resolvedPeriods, empIds)
      const employeeAggs = this.calculateEmployeeScores(validEmployees, assessments)

      const assessedEmployees = employeeAggs.filter(e => e.hasAssessments)
      const totalAssessed = assessedEmployees.length

      const avgScore = totalAssessed > 0
        ? assessedEmployees.reduce((sum, e) => sum + (e.total || 0), 0) / totalAssessed
        : 0

      const completionRate = totalEmployees > 0
        ? (totalAssessed / totalEmployees) * 100
        : 0

      // Get total active units
      let totalUnits = 1
      if (!unitId || unitId === 'all') {
        const { data: rawUnits } = await supabase
          .from('m_units')
          .select('id, code, name')
          .eq('is_active', true)

        const validUnits = (rawUnits || []).filter((u: any) => {
          const code = String(u.code || '').toUpperCase()
          const name = String(u.name || '').toUpperCase()
          return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
        })
        totalUnits = validUnits.length
      }

      return {
        totalEmployees,
        totalUnits,
        avgScore: Math.round(avgScore * 100) / 100,
        completionRate: Math.round(completionRate * 10) / 10,
        trends: { employees: 0, score: 0, completion: 0 }
      }
    } catch (error: any) {
      console.error('[DashboardService] Error in getDashboardStats:', error)
      return {
        totalEmployees: 0,
        totalUnits: 0,
        avgScore: 0,
        completionRate: 0,
        trends: { employees: 0, score: 0, completion: 0 }
      }
    }
  }

  /**
   * Get Top Performers: Highest scoring assessed employees
   */
  static async getTopPerformers(limit: number = 5, unitId?: string, period?: string, year?: string): Promise<TopPerformer[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)
      const validEmployees = await this.getValidEmployees(supabase, unitId)
      const empIds = validEmployees.map((e: any) => e.id)

      const assessments = await this.fetchAssessmentsForPeriods(supabase, resolvedPeriods, empIds)
      const employeeAggs = this.calculateEmployeeScores(validEmployees, assessments)

      const assessedOnly = employeeAggs.filter(e => e.hasAssessments)

      return assessedOnly
        .sort((a, b) => (b.total || 0) - (a.total || 0))
        .slice(0, limit)
        .map((p, i) => ({
          id: p.id,
          name: p.name,
          unit: p.unitName,
          score: p.total || 0,
          rank: i + 1
        }))
    } catch (error: any) {
      console.error('[DashboardService] Error in getTopPerformers:', error)
      return []
    }
  }

  /**
   * Get Needs Improvement: Lowest scoring assessed employees (> 0)
   */
  static async getWorstPerformers(limit: number = 5, unitId?: string, period?: string, year?: string): Promise<TopPerformer[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)
      const validEmployees = await this.getValidEmployees(supabase, unitId)
      const empIds = validEmployees.map((e: any) => e.id)

      const assessments = await this.fetchAssessmentsForPeriods(supabase, resolvedPeriods, empIds)
      const employeeAggs = this.calculateEmployeeScores(validEmployees, assessments)

      // Only include employees who have actually been assessed
      const assessedOnly = employeeAggs.filter(e => e.hasAssessments)

      // Prefer assessed employees with positive scores so unassessed empty rows aren't prioritized
      const assessedWithScore = assessedOnly.filter(e => (e.total || 0) > 0)
      const candidateList = assessedWithScore.length >= limit ? assessedWithScore : assessedOnly

      return candidateList
        .sort((a, b) => (a.total || 0) - (b.total || 0))
        .slice(0, limit)
        .map((p, i) => ({
          id: p.id,
          name: p.name,
          unit: p.unitName,
          score: p.total || 0,
          rank: i + 1
        }))
    } catch (error: any) {
      console.error('[DashboardService] Error in getWorstPerformers:', error)
      return []
    }
  }

  /**
   * Get Unit Performance Table data
   */
  static async getUnitPerformance(period?: string, year?: string): Promise<UnitPerformance[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)
      const validEmployees = await this.getValidEmployees(supabase)
      const assessments = await this.fetchAssessmentsForPeriods(supabase, resolvedPeriods)
      const employeeAggs = this.calculateEmployeeScores(validEmployees, assessments)

      // Group by Unit
      const unitMap = new Map<string, { id: string; name: string; totalEmps: number; assessedEmps: EmployeeAssessmentAggregate[] }>()

      for (const emp of employeeAggs) {
        if (!unitMap.has(emp.unitId)) {
          unitMap.set(emp.unitId, {
            id: emp.unitId,
            name: emp.unitName,
            totalEmps: 0,
            assessedEmps: []
          })
        }
        const uGroup = unitMap.get(emp.unitId)!
        uGroup.totalEmps++
        if (emp.hasAssessments) {
          uGroup.assessedEmps.push(emp)
        }
      }

      const results: UnitPerformance[] = []
      for (const u of Array.from(unitMap.values())) {
        const assessedCount = u.assessedEmps.length
        const avgScore = assessedCount > 0
          ? u.assessedEmps.reduce((sum, e) => sum + (e.total || 0), 0) / assessedCount
          : 0
        const completionRate = u.totalEmps > 0
          ? (assessedCount / u.totalEmps) * 100
          : 0

        results.push({
          id: u.id,
          name: u.name,
          avgScore: Math.round(avgScore * 100) / 100,
          completionRate: Math.round(completionRate * 10) / 10,
          employeeCount: u.totalEmps
        })
      }

      return results.sort((a, b) => b.avgScore - a.avgScore)
    } catch (error: any) {
      console.error('[DashboardService] Error in getUnitPerformance:', error)
      return []
    }
  }

  /**
   * Get 6-month Performance Trend: strictly solves NaN-NaN and inflated numbers
   */
  static async getPerformanceTrend(months: number = 6, unitId?: string, period?: string, year?: string): Promise<PerformanceTrend[]> {
    const supabase = await createAdminClient()

    try {
      const currentYear = year ? parseInt(year, 10) : new Date().getFullYear()

      // Determine anchor year and month cleanly
      let anchorYear = currentYear
      let anchorMonth = new Date().getMonth() + 1

      if (period) {
        if (period.startsWith('M-')) {
          anchorMonth = parseInt(period.split('-')[1], 10) || anchorMonth
        } else if (period.startsWith('Q-')) {
          const q = parseInt(period.split('-')[1], 10) || 1
          anchorMonth = q * 3
        } else if (period.startsWith('S-')) {
          const s = parseInt(period.split('-')[1], 10) || 1
          anchorMonth = s * 6
        } else if (period === 'full-year') {
          anchorMonth = 12
        } else if (period.includes('-')) {
          const parts = period.split('-')
          anchorYear = parseInt(parts[0], 10) || anchorYear
          anchorMonth = parseInt(parts[1], 10) || anchorMonth
        }
      } else {
        const latest = await this.getLatestPeriodWithData(supabase)
        if (latest && latest.includes('-')) {
          const parts = latest.split('-')
          anchorYear = parseInt(parts[0], 10) || anchorYear
          anchorMonth = parseInt(parts[1], 10) || anchorMonth
        }
      }

      // Build array of periods (e.g. last 6 months)
      const periods: string[] = []
      for (let i = 0; i < months; i++) {
        const d = new Date(anchorYear, anchorMonth - 1 - i, 1)
        periods.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }

      const validEmployees = await this.getValidEmployees(supabase, unitId)
      const empIds = validEmployees.map((e: any) => e.id)
      const assessments = await this.fetchAssessmentsForPeriods(supabase, periods, empIds)

      return periods.map(p => {
        const pAssessments = assessments.filter(a => a.period === p)
        if (pAssessments.length === 0) {
          return { month: p, p1: 0, p2: 0, p3: 0, total: 0 }
        }

        const employeeAggs = this.calculateEmployeeScores(validEmployees, pAssessments)
        const assessedOnly = employeeAggs.filter(e => e.hasAssessments)

        if (assessedOnly.length === 0) {
          return { month: p, p1: 0, p2: 0, p3: 0, total: 0 }
        }

        const p1Avg = assessedOnly.reduce((s, e) => s + (e.p1 || 0), 0) / assessedOnly.length
        const p2Avg = assessedOnly.reduce((s, e) => s + (e.p2 || 0), 0) / assessedOnly.length
        const p3Avg = assessedOnly.reduce((s, e) => s + (e.p3 || 0), 0) / assessedOnly.length
        const totalAvg = assessedOnly.reduce((s, e) => s + (e.total || 0), 0) / assessedOnly.length

        return {
          month: p,
          p1: Math.round(p1Avg * 100) / 100,
          p2: Math.round(p2Avg * 100) / 100,
          p3: Math.round(p3Avg * 100) / 100,
          total: Math.round(totalAvg * 100) / 100
        }
      })
    } catch (error: any) {
      console.error('[DashboardService] Error in getPerformanceTrend:', error)
      return []
    }
  }

  /**
   * Get KPI Distribution: P1, P2, P3 category breakdown
   */
  static async getKPIDistribution(unitId?: string, period?: string, year?: string): Promise<KPIDistribution[]> {
    const supabase = await createAdminClient()

    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)
      const validEmployees = await this.getValidEmployees(supabase, unitId)
      const empIds = validEmployees.map((e: any) => e.id)
      const assessments = await this.fetchAssessmentsForPeriods(supabase, resolvedPeriods, empIds)

      const employeeAggs = this.calculateEmployeeScores(validEmployees, assessments)
      const assessedOnly = employeeAggs.filter(e => e.hasAssessments)

      if (assessedOnly.length === 0) {
        return [
          { name: 'P1 (Posisi)', value: 0, color: '#3b82f6' },
          { name: 'P2 (Kinerja)', value: 0, color: '#10b981' },
          { name: 'P3 (Potensi)', value: 0, color: '#f59e0b' }
        ]
      }

      const p1Avg = assessedOnly.reduce((s, e) => s + (e.p1 || 0), 0) / assessedOnly.length
      const p2Avg = assessedOnly.reduce((s, e) => s + (e.p2 || 0), 0) / assessedOnly.length
      const p3Avg = assessedOnly.reduce((s, e) => s + (e.p3 || 0), 0) / assessedOnly.length

      return [
        { name: 'P1 (Posisi)', value: Math.round(p1Avg * 100) / 100, color: '#3b82f6' },
        { name: 'P2 (Kinerja)', value: Math.round(p2Avg * 100) / 100, color: '#10b981' },
        { name: 'P3 (Potensi)', value: Math.round(p3Avg * 100) / 100, color: '#f59e0b' }
      ]
    } catch (error: any) {
      console.error('[DashboardService] Error in getKPIDistribution:', error)
      return [
        { name: 'P1 (Posisi)', value: 0, color: '#3b82f6' },
        { name: 'P2 (Kinerja)', value: 0, color: '#10b981' },
        { name: 'P3 (Potensi)', value: 0, color: '#f59e0b' }
      ]
    }
  }

  /**
   * Get stats for an individual employee (for employee role view)
   */
  static async getEmployeeStats(employeeId: string, period?: string, year?: string): Promise<EmployeeStats> {
    const supabase = await createAdminClient()
    try {
      const resolvedPeriods = await this.getResolvedPeriods(supabase, period, year)

      // 1. Get employee info
      const { data: employee, error: empErr } = await supabase
        .from('m_employees')
        .select('id, full_name, unit_id, role, m_units!unit_id(id, name, code)')
        .eq('id', employeeId)
        .single()

      if (empErr || !employee) throw new Error('Employee not found')

      // 2. Fetch unit employees to determine rank
      const unitEmployees = await this.getValidEmployees(supabase, employee.unit_id)
      const empIds = unitEmployees.map((e: any) => e.id)

      const assessments = await this.fetchAssessmentsForPeriods(supabase, resolvedPeriods, empIds)
      const employeeAggs = this.calculateEmployeeScores(unitEmployees, assessments)

      const currentEmpAgg = employeeAggs.find(e => e.id === employeeId)
      const score = currentEmpAgg?.total || 0
      const isAssessed = currentEmpAgg?.hasAssessments || false

      // Calculate rank in unit
      const assessedInUnit = employeeAggs
        .filter(e => e.hasAssessments)
        .sort((a, b) => (b.total || 0) - (a.total || 0))

      const rankIndex = assessedInUnit.findIndex(e => e.id === employeeId)
      const rank = rankIndex >= 0 ? rankIndex + 1 : 0

      return {
        score: Math.round(score * 100) / 100,
        rank: rank || 0,
        completionStatus: isAssessed ? 'Selesai' : 'Belum Dinilai',
        unitRank: rank > 0 ? `${rank} dari ${assessedInUnit.length}` : '-'
      }
    } catch (error) {
      console.error('[DashboardService] Error in getEmployeeStats:', error)
      return { score: 0, rank: 0, completionStatus: 'Belum Ada', unitRank: '-' }
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
      console.error('[DashboardService] Exception in getRecentActivities:', error)
      return []
    }
  }
}
