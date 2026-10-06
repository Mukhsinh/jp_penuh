import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzqjxmkqegotbptmetpp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cWp4bWtxZWdvdGJwdG1ldHBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDE0MjU4NCwiZXhwIjoyMTA1NzE4NTg0fQ.aSJVk1R9cHIXgOHOkdTEo3lCHsUXy8FMfu6SsWTax9g';

async function fetchFromSupabase(table, query = '*') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${query}`, {
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${table}: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

async function run() {
    try {
        const units = await fetchFromSupabase('m_units');
        console.log(`DB m_units count: ${units.length}`);
        console.log('DB m_units:', units.map(u => ({ id: u.id, code: u.code, name: u.name, proportion: u.proportion_percentage })));

        const categories = await fetchFromSupabase('m_kpi_categories');
        console.log(`DB m_kpi_categories count: ${categories.length}`);

        const indicators = await fetchFromSupabase('m_kpi_indicators');
        console.log(`DB m_kpi_indicators count: ${indicators.length}`);

        const subIndicators = await fetchFromSupabase('m_kpi_sub_indicators');
        console.log(`DB m_kpi_sub_indicators count: ${subIndicators.length}`);
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
