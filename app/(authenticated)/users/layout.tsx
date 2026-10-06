import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

export default async function UsersLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    // Verify session safely
    const user = await getAuthenticatedUser(supabase)

    if (!user) {
        redirect('/login')
    }

    const email = user.email
    const isSuperAdmin = (
        user.app_metadata?.role === 'superadmin' ||
        user.user_metadata?.role === 'superadmin' ||
        email === 'admin@sungaipenuh.com'
    )

    if (!isSuperAdmin) {
        // Redirect non-superadmins back to dashboard or home
        redirect('/')
    }

    return <>{children}</>
}
