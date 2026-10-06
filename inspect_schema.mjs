import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzqjxmkqegotbptmetpp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cWp4bWtxZWdvdGJwdG1ldHBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDE0MjU4NCwiZXhwIjoyMTA1NzE4NTg0fQ.aSJVk1R9cHIXgOHOkdTEo3lCHsUXy8FMfu6SsWTax9g';

async function run() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
    });
    const openapi = await res.json();
    const tables = ['m_units', 'm_kpi_categories', 'm_kpi_indicators', 'm_kpi_sub_indicators'];
    for (const t of tables) {
        const schemaDef = openapi.definitions[t];
        console.log(`=== TABLE: ${t} ===`);
        if (schemaDef) {
            console.log('Properties:', Object.keys(schemaDef.properties));
            console.log('Full schema:', JSON.stringify(schemaDef.properties, null, 2));
        } else {
            console.log('No definition found');
        }
    }
}

run();
