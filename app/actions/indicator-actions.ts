'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface IndicatorFormData {
    category_id: string
    code?: string
    name: string
    description?: string | null
    weight_percentage: number
    target_value?: number
    measurement_unit?: string | null
    calculation_method?: 'indexing' | 'priority'
    measurement_type?: 'scoring' | 'quantitative'
    unit_tariff?: number
    base_index_value?: number | null
    service_types?: string[]
}

export async function createIndicator(formData: IndicatorFormData) {
    const supabase = await createClient()

    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) throw new Error('User tidak terautentikasi')

        const { data: employee } = await supabase
            .from('m_employees')
            .select('role, is_active')
            .eq('user_id', user.id)
            .single()

        if (!employee || !employee.is_active) throw new Error('User tidak aktif atau tidak terdaftar')
        if (!['superadmin', 'unit_manager'].includes(employee.role)) throw new Error('Tidak memiliki permission')

        // Generate code if not provided
        let finalCode = formData.code
        if (!finalCode) {
            const { data: existing } = await supabase
                .from('m_kpi_indicators')
                .select('code')
                .eq('category_id', formData.category_id)
                .order('code', { ascending: false })
                .limit(1)

            if (existing && existing.length > 0) {
                const lastCode = existing[0].code
                const match = lastCode.match(/IND-(\d+)/)
                if (match) {
                    const nextNum = parseInt(match[1]) + 1
                    finalCode = `IND-${String(nextNum).padStart(3, '0')}`
                } else {
                    finalCode = `IND-${Date.now()}`
                }
            } else {
                finalCode = 'IND-001'
            }
        }

        const { data, error } = await supabase
            .from('m_kpi_indicators')
            .insert({
                category_id: formData.category_id,
                code: finalCode,
                name: formData.name,
                description: formData.description,
                weight_percentage: formData.weight_percentage,
                target_value: formData.target_value,
                measurement_unit: formData.measurement_unit,
                base_index_value: formData.base_index_value || 0,
                calculation_method: formData.calculation_method,
                measurement_type: formData.measurement_type,
                unit_tariff: formData.unit_tariff || 0,
                service_types: formData.service_types || [],
                is_active: true
            })
            .select()
            .single()

        if (error) throw error

        revalidatePath('/kpi-config')
        return { success: true, data }
    } catch (error: any) {
        console.error('Error in createIndicator:', error)
        return { success: false, error: error.message }
    }
}

export async function updateIndicator(id: string, formData: Partial<IndicatorFormData>) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Unauthorized' }
        }

        // Get user role and unit
        const { data: employee } = await supabase
            .from('m_employees')
            .select('role, is_active, unit_id')
            .eq('user_id', user.id)
            .single()

        if (!employee || !employee.is_active) {
            return { success: false, error: 'Employee not found or inactive' }
        }

        const isSuperadmin = employee.role === 'superadmin' || user.email === 'admin@sungaipenuh.com'
        const isManager = employee.role === 'unit_manager'

        if (!isSuperadmin && !isManager) {
            return { success: false, error: 'Permission denied' }
        }

        // Using admin client for authorized personnel to ensure write access
        const adminSupabase = await createAdminClient()

        // If manager, check if they own this indicator's unit
        if (isManager && !isSuperadmin) {
            const { data: indicator } = await adminSupabase
                .from('m_kpi_indicators')
                .select('category_id, m_kpi_categories!inner(unit_id)')
                .eq('id', id)
                .single()

            if (!indicator || (indicator as any).m_kpi_categories.unit_id !== employee.unit_id) {
                return { success: false, error: 'You only have permission to update indicators in your own unit' }
            }
        }

        const { data, error } = await adminSupabase
            .from('m_kpi_indicators')
            .update({
                name: formData.name,
                description: formData.description,
                weight_percentage: formData.weight_percentage,
                target_value: formData.target_value,
                measurement_unit: formData.measurement_unit,
                base_index_value: formData.base_index_value !== undefined ? formData.base_index_value : 0,
                calculation_method: formData.calculation_method,
                measurement_type: formData.measurement_type,
                unit_tariff: formData.unit_tariff || 0,
                service_types: formData.service_types || [],
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Update indicator error:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/kpi-config')
        return { success: true, data }
    } catch (error: any) {
        console.error('Update indicator catch error:', error)
        return { success: false, error: error.message || 'An unexpected error occurred' }
    }
}

export async function deleteIndicator(id: string) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from('m_kpi_indicators')
            .update({ is_active: false })
            .eq('id', id)

        if (error) throw error

        revalidatePath('/kpi-config')
        return { success: true }
    } catch (error: any) {
        console.error('Error in deleteIndicator:', error)
        return { success: false, error: error.message }
    }
}
