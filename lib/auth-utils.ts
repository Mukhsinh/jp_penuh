import { User } from '@supabase/supabase-js'

export const SUPERADMIN_EMAILS = [
    'admin@sungaipenuh.com'
]

export function isSuperAdmin(user: User | null): boolean {
    if (!user) return false

    const appRole = user.app_metadata?.role
    const userRole = user.user_metadata?.role
    const email = user.email

    return (
        appRole === 'superadmin' ||
        userRole === 'superadmin' ||
        (!!email && SUPERADMIN_EMAILS.includes(email))
    )
}

export function isUnitManager(user: User | null): boolean {
    if (!user) return false

    const appRole = user.app_metadata?.role
    const userRole = user.user_metadata?.role

    return appRole === 'unit_manager' || userRole === 'unit_manager'
}
