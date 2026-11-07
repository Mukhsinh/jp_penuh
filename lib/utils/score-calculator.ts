/**
 * Score Calculator utilities
 * Centralizes KPI score computation logic for both Medical and non-Medical units.
 *
 * Medical units: total = p1 + p2 + p3 (SUM, no weighting)
 * Other units:   total = (p1 + p2 + p3) / 3 (simple average of category scores)
 */

/**
 * Calculates the total employee score from category sub-scores.
 * @param p1 - Score for category P1
 * @param p2 - Score for category P2
 * @param p3 - Score for category P3
 * @param isMedical - Whether the employee belongs to a Medical unit
 */
export function calculateTotalScore(
    p1: number,
    p2: number,
    p3: number,
    isMedical: boolean,
    contractPercentage?: number
): number {
    const raw = isMedical ? (p1 + p2 + p3) : (p1 + p2 + p3) / 3
    if (isMedical && contractPercentage !== undefined && contractPercentage !== null && contractPercentage !== 100) {
        return raw * (Math.max(0, contractPercentage) / 100)
    }
    return raw
}

/**
 * Calculates a category sub-score from individual indicator scores.
 * Medical: SUM of scores; Non-Medical: average.
 */
export function calculateCategoryScore(scores: number[], isMedical: boolean): number {
    if (scores.length === 0) return 0
    const total = scores.reduce((a, b) => a + b, 0)
    return isMedical ? total : total / scores.length
}
