import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzqjxmkqegotbptmetpp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cWp4bWtxZWdvdGJwdG1ldHBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDE0MjU4NCwiZXhwIjoyMTA1NzE4NTg0fQ.aSJVk1R9cHIXgOHOkdTEo3lCHsUXy8FMfu6SsWTax9g';

async function fetchCount(table) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Prefer': 'count=exact'
        }
    });
    const count = res.headers.get('content-range');
    return count;
}

async function run() {
    const tables = ['m_employees', 't_kpi_assessments', 't_unit_scores', 't_individual_scores', 't_calculation_results'];
    for (const t of tables) {
        try {
            const c = await fetchCount(t);
            console.log(`${t} count:`, c);
        } catch (e) {
            console.log(`${t} error:`, e.message);
        }
    }
}

run();
