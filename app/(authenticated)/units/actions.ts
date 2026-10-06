'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { isSuperAdmin as checkSuperAdmin } from '@/lib/auth-utils'

export async function getUnitsWithCounts() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { data: [], error: 'Tidak terautentikasi' }
        }

        const isSuperAdmin = checkSuperAdmin(user as any)

        // Use admin client for superadmin to bypass RLS and see ALL units
        // Use regular client for others to respect RLS
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
