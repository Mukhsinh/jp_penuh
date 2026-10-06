'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { revalidatePath } from 'next/cache'

export async function getUnitsForKPI() {
    try {
        const supabase = await createClient()
        const user = await getAuthenticatedUser(supabase)

        if (!user) return { data: [], error: 'Tidak terautentikasi' }

        const isSuperAdmin =
            user.app_metadata?.role === 'superadmin' ||
            user.user_metadata?.role === 'superadmin' ||
            user.email === 'admin@sungaipenuh.com'

        const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

        const { data, error } = await fetchClient
            .from('m_units')
            .select('id, code, name, kpi_schema_mode')
            .eq('is_active', true)
            .order('code')

        if (error) throw error

        let filteredUnits = (data || []).filter(u => {
            const code = String(u.code || '').toUpperCase()
            const name = String(u.name || '').toUpperCase()
            return code !== 'ADMIN' && code !== 'SUPERADMIN' && !name.includes('SUPERADMIN')
        })

        if (!isSuperAdmin && user.user_metadata?.role === 'unit_manager' && user.user_metadata.unit_id) {
            filteredUnits = filteredUnits.filter(u => u.id === user.user_metadata.unit_id)
        }

        return { data: filteredUnits }
    } catch (error: any) {
        console.error('getUnitsForKPI error:', error)
        return { data: [], error: error.message }
    }
}

export async function updateUnitKPISchemaMode(unitId: string, kpiSchemaMode: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Tidak terautentikasi' }

        const isSuperAdmin =
            user.app_metadata?.role === 'superadmin' ||
            user.user_metadata?.role === 'superadmin' ||
            user.email === 'admin@sungaipenuh.com'

        const client = isSuperAdmin ? await createAdminClient() : supabase

        const { error } = await client
            .from('m_units')
            .update({ kpi_schema_mode: kpiSchemaMode, updated_at: new Date().toISOString() })
            .eq('id', unitId)

        if (error) throw error

        revalidatePath('/kpi-config')
        return { success: true }
    } catch (error: any) {
        console.error('updateUnitKPISchemaMode error:', error)
        return { error: error.message }
    }
}

export async function getKPIStructure(unitId: string, revenueType: string = 'all') {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return { error: 'Tidak terautentikasi' }

        const isSuperAdmin =
            user.app_metadata?.role === 'superadmin' ||
            user.user_metadata?.role === 'superadmin' ||
            user.email === 'admin@sungaipenuh.com'

        const fetchClient = isSuperAdmin ? await createAdminClient() : supabase

        const allowedRevenueTypes = revenueType === 'all' ? ['all', 'bpjs', 'umum'] : [revenueType, 'all']

        const [categoriesResult, indicatorsResult, subIndicatorsResult] = await Promise.all([
            fetchClient
                .from('m_kpi_categories')
                .select('*')
                .eq('unit_id', unitId)
                .in('revenue_type', allowedRevenueTypes)
                .order('category'),

            fetchClient
                .from('m_kpi_indicators')
                .select(`
          *,
          m_kpi_categories!m_kpi_indicators_category_id_fkey!inner (unit_id, configuration_style, is_weighted, revenue_type)
        `)
                .eq('m_kpi_categories.unit_id', unitId)
                .in('m_kpi_categories.revenue_type', allowedRevenueTypes)
                .order('code'),

            fetchClient
                .from('m_kpi_sub_indicators')
                .select(`
          *,
          m_kpi_indicators!m_kpi_sub_indicators_indicator_id_fkey!inner (
            category_id,
            m_kpi_categories!m_kpi_indicators_category_id_fkey!inner (unit_id, revenue_type)
          )
        `)
                .eq('m_kpi_indicators.m_kpi_categories.unit_id', unitId)
                .in('m_kpi_indicators.m_kpi_categories.revenue_type', allowedRevenueTypes)
                .order('code')
        ])

        if (categoriesResult.error) throw categoriesResult.error
        if (indicatorsResult.error) throw indicatorsResult.error
        if (subIndicatorsResult.error) throw subIndicatorsResult.error

        return {
            categories: categoriesResult.data || [],
            indicators: indicatorsResult.data || [],
            subIndicators: subIndicatorsResult.data || []
        }
    } catch (error: any) {
        console.error('getKPIStructure error:', error)
        return { error: error.message }
    }
}

