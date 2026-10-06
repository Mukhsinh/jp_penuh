import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function migrateEmails() {
    console.log('--- Migrating emails in auth.users ---')
    const { data: authUsersData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (authError) {
        console.error('Error fetching auth users:', authError)
        return
    }

    for (const user of authUsersData.users) {
        if (user.email && (user.email.includes('sungaibahar.com') || user.email.includes('sungaibahar.local'))) {
            const newEmail = user.email
                .replace('@sungaibahar.com', '@sungaipenuh.com')
                .replace('@sungaibahar.local', '@sungaipenuh.local')

            console.log(`Updating auth user ${user.id}: ${user.email} -> ${newEmail}`)
            const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
                email: newEmail,
                email_confirm: true
            })
            if (updateError) {
                console.error(`Failed to update user ${user.id}:`, updateError)
            } else {
                console.log(`Successfully updated user ${user.id}`)
            }
        }
    }

    console.log('--- Migrating emails in m_employees ---')
    const { data: employees, error: empError } = await supabase
        .from('m_employees')
        .select('id, email')

    if (empError) {
        console.error('Error fetching m_employees:', empError)
        return
    }

    for (const emp of employees || []) {
        if (emp.email && (emp.email.includes('sungaibahar.com') || emp.email.includes('sungaibahar.local'))) {
            const newEmail = emp.email
                .replace('@sungaibahar.com', '@sungaipenuh.com')
                .replace('@sungaibahar.local', '@sungaipenuh.local')

            console.log(`Updating employee ${emp.id}: ${emp.email} -> ${newEmail}`)
            const { error: empUpdateErr } = await supabase
                .from('m_employees')
                .update({ email: newEmail })
                .eq('id', emp.id)

            if (empUpdateErr) {
                console.error(`Failed to update employee ${emp.id}:`, empUpdateErr)
            } else {
                console.log(`Successfully updated employee ${emp.id}`)
            }
        }
    }

    console.log('--- Migration Completed ---')
}

migrateEmails()
