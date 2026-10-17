import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export const dynamic = 'force-dynamic'

/**
 * GET /api/assessment/period-approval?period=2026-01
 * Returns approval status of the requested period and all available periods.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')

    const adminClient = await createAdminClient()

    // 1. Fetch all periods from t_pool and remunerasi_periode
    const { data: pools } = await adminClient
      .from('t_pool')
      .select('period, status, approved_by, approved_at')
      .order('period', { ascending: false })

    const { data: remPeriods } = await adminClient
      .from('remunerasi_periode')
      .select('periode, status')

    const remMap = new Map((remPeriods || []).map((r: any) => [r.periode, r.status]))

    const periodList = (pools || []).map((p: any) => {
      const remStatus = remMap.get(p.period)
      const isApproved = p.status === 'approved' || remStatus === 'approved'
      return {
        period: p.period,
        status: isApproved ? 'approved' : 'draft',
        isApproved,
        approved_by: p.approved_by,
        approved_at: p.approved_at
      }
    })

    const target = periodList.find(p => p.period === period) || {
      period: period || '',
      status: 'draft',
      isApproved: false,
      approved_by: null,
      approved_at: null
    }

    // Check user role
    const authRole = user.app_metadata?.role || user.user_metadata?.role || (user as any).role
    const isSuperAdmin = authRole === 'superadmin' || authRole === 'admin' || user.email === 'admin@sungaipenuh.com'

    return NextResponse.json({
      success: true,
      currentPeriod: target,
      allPeriods: periodList,
      isSuperAdmin
    })
  } catch (error: any) {
    console.error('Error fetching period approval:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/assessment/period-approval
 * Body: { period: string, action: 'approve' | 'unapprove' }
 * Approves or unapproves a period (restricted to Superadmin).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getAuthenticatedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify Superadmin
    const authRole = user.app_metadata?.role || user.user_metadata?.role || (user as any).role
    const isSuperAdmin = authRole === 'superadmin' || authRole === 'admin' || user.email === 'admin@sungaipenuh.com'
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Hanya Superadmin yang memiliki hak untuk menyetujui atau membatalkan persetujuan periode.' }, { status: 403 })
    }

    const body = await request.json()
    const { period, action } = body

    if (!period || !action) {
      return NextResponse.json({ error: 'Parameter period dan action wajib disertakan' }, { status: 400 })
    }

    const adminClient = await createAdminClient()
    const isApprove = action === 'approve'

    // Update t_pool
    const poolUpdate = isApprove
      ? { status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() }
      : { status: 'draft', approved_by: null, approved_at: null }

    await adminClient
      .from('t_pool')
      .update(poolUpdate)
      .eq('period', period)

    // Update remunerasi_periode
    const remStatus = isApprove ? 'approved' : 'calculated'
    await adminClient
      .from('remunerasi_periode')
      .update({ status: remStatus, updated_at: new Date().toISOString() })
      .eq('periode', period)

    // Optional notification/audit
    try {
      await adminClient.from('t_notification').insert({
        title: isApprove ? `Periode ${period} Disetujui` : `Persetujuan Periode ${period} Dibatalkan`,
        message: isApprove
          ? `Periode ${period} telah disetujui oleh Superadmin dan penilaian telah dikunci.`
          : `Persetujuan periode ${period} dibatalkan oleh Superadmin. Penilaian dibuka kembali.`,
        recipient_id: user.id,
        is_read: false
      })
    } catch (e) {
      // ignore notification errors
    }

    return NextResponse.json({
      success: true,
      period,
      status: isApprove ? 'approved' : 'draft',
      isApproved: isApprove,
      message: isApprove
        ? `Periode ${period} berhasil disetujui. Penilaian sekarang terkunci.`
        : `Persetujuan periode ${period} berhasil dibatalkan. Penilaian sekarang dapat diedit kembali.`
    })
  } catch (error: any) {
    console.error('Error updating period approval:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
