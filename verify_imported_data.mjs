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
    console.log('=== VERIFYING IMPORTED DATA ===');

    // 1. Check Units
    const units = await fetchFromSupabase('m_units');
    console.log(`Total m_units in DB: ${units.length}`);
    const superadminUnits = units.filter(u => String(u.code).toUpperCase() === 'ADMIN' || String(u.name).toUpperCase().includes('SUPERADMIN'));
    console.log(`Superadmin units count: ${superadminUnits.length}`);
    console.log(`Superadmin unit details:`, superadminUnits.map(u => ({ id: u.id, code: u.code, name: u.name })));

    // 2. Check Categories
    const categories = await fetchFromSupabase('m_kpi_categories');
    console.log(`Total m_kpi_categories in DB: ${categories.length}`);

    // 3. Check Indicators
    const indicators = await fetchFromSupabase('m_kpi_indicators');
    console.log(`Total m_kpi_indicators in DB: ${indicators.length}`);

    // 4. Check Sub-Indicators
    const subIndicators = await fetchFromSupabase('m_kpi_sub_indicators');
    console.log(`Total m_kpi_sub_indicators in DB: ${subIndicators.length}`);

    // 5. Foreign Key Integrity Check
    const unitIds = new Set(units.map(u => u.id));
    const categoryIds = new Set(categories.map(c => c.id));
    const indicatorIds = new Set(indicators.map(i => i.id));

    const orphanCategories = categories.filter(c => !unitIds.has(c.unit_id));
    const orphanIndicators = indicators.filter(i => !categoryIds.has(i.category_id));
    const orphanSubIndicators = subIndicators.filter(s => !indicatorIds.has(s.indicator_id));

    console.log(`Orphan categories: ${orphanCategories.length}`);
    console.log(`Orphan indicators: ${orphanIndicators.length}`);
    console.log(`Orphan sub-indicators: ${orphanSubIndicators.length}`);

    if (units.length === 19 && categories.length === 50 && indicators.length === 152 && subIndicators.length === 186 && orphanCategories.length === 0 && orphanIndicators.length === 0 && orphanSubIndicators.length === 0) {
        console.log('VERIFICATION PASSED 100%! Data is fully consistent and matched expected specs.');
    } else {
        console.warn('VERIFICATION WARN: Row counts or orphans differ from expected!');
    }
}

run();
