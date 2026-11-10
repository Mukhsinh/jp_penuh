/**
 * Medical Unit utilities
 * Single source of truth for identifying the "Medis" (Medical) unit.
 * Medical units use SUM-based scoring instead of weighted averages.
 */

export const MEDICAL_UNIT_ID = '8914356c-4ec8-4bd7-bc5e-5fb619f6c3f2'
export const MEDICAL_UNIT_NAME_KEYWORD = 'MEDIS'

/**
 * Determines if a unit is the Medical (Medis) unit.
 * @param unitId - The unit's UUID
 * @param unitName - The unit's display name
 */
export function isMedicalUnit(unitId?: string | null, unitName?: string | null): boolean {
    if (unitId && unitId === MEDICAL_UNIT_ID) return true

    if (unitName) {
        const upperName = unitName.toUpperCase().trim()

        // Exact match for 'MEDIS' or starts with 'MEDIS ' 
        // to handle cases like 'MEDIS - DOKTER' but exclude 'REKAM MEDIS'
        if (upperName === MEDICAL_UNIT_NAME_KEYWORD) return true
        if (upperName.startsWith(MEDICAL_UNIT_NAME_KEYWORD + ' ')) return true

        // Original logic was too broad (includes), now we only allow 
        // specific 'MEDIS' unit or the known ID.
    }

    return false
}

export const PARTIAL_ELIGIBLE_UNIT_IDS = [
    '0c186ef2-1cb2-46a6-b7c6-53d86b744dbb', // KEPERAWATAN
    '56bbe1c8-5576-42d1-8a76-d38f38203f56', // RADIOLOGI
    '7de90295-db82-43c0-9f51-4434612aaeda', // REKAM MEDIK
]

export const PARTIAL_ELIGIBLE_KEYWORDS = [
    'KEPERAWATAN',
    'RADIOLOGI',
    'REKAM MEDIK',
    'REKAM MEDIS'
]

/**
 * Determines if a unit is eligible for the 'Sebagian' (partial percentage) feature
 * specifically for Pendapatan UMUM: KEPERAWATAN, RADIOLOGI, and REKAM MEDIK.
 * @param unitId - The unit's UUID
 * @param unitName - The unit's display name
 */
export function isPartialEligibleUnit(unitId?: string | null, unitName?: string | null): boolean {
    if (unitId && PARTIAL_ELIGIBLE_UNIT_IDS.includes(unitId)) return true

    if (unitName) {
        const upperName = unitName.toUpperCase().trim()
        for (const kw of PARTIAL_ELIGIBLE_KEYWORDS) {
            if (upperName.includes(kw)) return true
        }
    }

    return false
}
