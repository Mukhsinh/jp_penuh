'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { isSuperAdmin as checkSuperAdmin } from '@/lib/auth-utils'
import {
  getUnitPeriods,
  getUnitsByPeriod,
  lockUnitPeriod,
  unlockUnitPeriod,
  createNextUnitPeriod,
  updateUnitProportionInPeriod,
  ensureDefaultUnitPeriodEstablished
} from '@/lib/services/unit-period.service'

/**
 * Server action to get available unit periods
 */
export async function getUnitPeriodsAction() {
  try {
    return await getUnitPeriods()
  } catch (error: any) {
    console.error('getUnitPeriodsAction error:', error)
    return { data: [], error: error.message || 'Gagal memuat periode unit' }
  }
}

/**
 * Server action to get units with counts and proportions for a specific period
 */
export async function getUnitsByPeriodAction(period: string) {
  try {
    return await getUnitsByPeriod(period)
  } catch (error: any) {
    console.error('getUnitsByPeriodAction error:', error)
    return {
      data: [],
      periodInfo: { period, is_locked: false, period_name: period },
      error: error.message || 'Gagal memuat data unit periode'
    }
  }
}

/**
 * Server action to lock a unit period
 */
export async function lockUnitPeriodAction(period: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Tidak terautentikasi' }
    }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) {
      return { success: false, error: 'Hanya Superadmin yang memiliki akses untuk mengunci periode unit' }
    }

    const userName = user.user_metadata?.full_name || user.email || 'Admin'
    const result = await lockUnitPeriod(period, userName)

    if (result.success) {
      revalidatePath('/units')
      revalidatePath('/pegawai')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }

    return result
  } catch (error: any) {
    console.error('lockUnitPeriodAction error:', error)
    return { success: false, error: error.message || 'Gagal mengunci periode unit' }
  }
}

/**
 * Server action to unlock a unit period
 */
export async function unlockUnitPeriodAction(period: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Tidak terautentikasi' }
    }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) {
      return { success: false, error: 'Hanya Superadmin yang memiliki akses untuk membuka kunci periode unit' }
    }

    const result = await unlockUnitPeriod(period)

    if (result.success) {
      revalidatePath('/units')
      revalidatePath('/pegawai')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }

    return result
  } catch (error: any) {
    console.error('unlockUnitPeriodAction error:', error)
    return { success: false, error: error.message || 'Gagal membuka kunci periode unit' }
  }
}

/**
 * Server action to create/open a new unit period
 */
export async function createNextUnitPeriodAction(newPeriod: string, sourcePeriod?: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Tidak terautentikasi' }
    }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) {
      return { success: false, error: 'Hanya Superadmin yang dapat membuat periode baru' }
    }

    const result = await createNextUnitPeriod(newPeriod, sourcePeriod)

    if (result.success) {
      revalidatePath('/units')
      revalidatePath('/pegawai')
      revalidatePath('/assessment')
      revalidatePath('/reports')
    }

    return result
  } catch (error: any) {
    console.error('createNextUnitPeriodAction error:', error)
    return { success: false, error: error.message || 'Gagal membuat periode unit baru' }
  }
}

/**
 * Server action to update unit proportion for a specific period
 */
export async function updateUnitProportionAction(
  period: string,
  unitId: string,
  data: {
    proportion_percentage: number
    proportion_umum_percentage?: number | null
    use_same_proportion?: boolean
    is_active?: boolean
  }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Tidak terautentikasi' }
    }

    const isSuperAdmin = checkSuperAdmin(user as any)
    if (!isSuperAdmin) {
      return { success: false, error: 'Hanya Superadmin yang dapat mengubah proporsi unit' }
    }

    const result = await updateUnitProportionInPeriod(period, unitId, data)

    if (result.success) {
      revalidatePath('/units')
      revalidatePath('/reports')
    }

    return result
  } catch (error: any) {
    console.error('updateUnitProportionAction error:', error)
    return { success: false, error: error.message || 'Gagal memperbarui proporsi unit' }
  }
}

/**
 * Backwards compatible getUnitsWithCounts
 */
export async function getUnitsWithCounts() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { data: [], error: 'Tidak terautentikasi' }
    }

    const isSuperAdmin = checkSuperAdmin(user as any)
    const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

    const { data: rawUnits, error: unitsError } = await fetchClient
      .from('m_units')
      .select(`
        *,
        employees:m_employees(count)
      `)
      .order('code', { ascending: true })

    if (unitsError) {
      console.error('Error fetching units with counts:', unitsError)
      return { data: [], error: unitsError.message }
    }

    const units = (rawUnits || []).filter(u => {
      const code = String(u.code || '').toUpperCase()
      const name = String(u.name || '').toUpperCase()
      return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
    })

    return { data: units }
  } catch (error: any) {
    console.error('getUnitsWithCounts error:', error)
    return { data: [], error: error.message || 'Terjadi kesalahan' }
  }
}
