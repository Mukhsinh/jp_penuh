import { createClient } from '@supabase/supabase-js';

const url = 'https://fzqjxmkqegotbptmetpp.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cWp4bWtxZWdvdGJwdG1ldHBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDE0MjU4NCwiZXhwIjoyMTA1NzE4NTg0fQ.aSJVk1R9cHIXgOHOkdTEo3lCHsUXy8FMfu6SsWTax9g';

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function setup() {
    // 1. Create Unit
    const { data: unit, error: unitErr } = await supabase
        .from('m_units')
        .upsert({ code: 'SA', name: 'Superadmin Unit', proportion_percentage: 0 }, { onConflict: 'code' })
        .select()
        .single();

    if (unitErr) {
        console.error('Error creating unit:', unitErr);
        return;
    }
    console.log('Unit Ready:', unit.name, '(' + unit.id + ')');

    // 2. Create User
    const { data: userRecord, error: userErr } = await supabase.auth.admin.createUser({
        email: 'admin@sungaipenuh.com',
        password: 'admin123',
        email_confirm: true,
        user_metadata: { role: 'superadmin', full_name: 'Superadmin Sungaipenuh' }
    });

    let userId;
    if (userErr) {
        if (userErr.message.includes('already exists') || userErr.message.includes('already been registered') || userErr.status === 422) {
            console.log('User might already exist. Trying to fetch...');
            const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
            const existing = usersData?.users?.find(u => u.email === 'admin@sungaipenuh.com');
            if (existing) {
                userId = existing.id;
                // update password & meta just in case
                await supabase.auth.admin.updateUserById(userId, {
                    password: 'admin123',
                    user_metadata: { role: 'superadmin', full_name: 'Superadmin Sungaipenuh' }
                });
                console.log('Updated existing auth user.');
            }
        } else {
            console.error('Error creating user:', userErr);
            return;
        }
    } else {
        userId = userRecord.user.id;
        console.log('Created new auth user.');
    }

    if (!userId) {
        console.error('Failed to get user ID');
        return;
    }
    console.log('Auth User ID:', userId);

    // 3. Create/Update Employee record
    const { data: emp, error: empErr } = await supabase
        .from('m_employees')
        .upsert({
            user_id: userId,
            employee_code: 'SA001',
            full_name: 'Superadmin Sungaipenuh',
            email: 'admin@sungaipenuh.com',
            role: 'superadmin',
            unit_id: unit.id,
            is_active: true
        }, { onConflict: 'email' })
        .select();

    if (empErr) {
        console.error('Error mapping employee:', empErr);
        return;
    }

    console.log('Successfully created/linked superadmin in m_employees!');
}

setup();
