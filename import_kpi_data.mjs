import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzqjxmkqegotbptmetpp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cWp4bWtxZWdvdGJwdG1ldHBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDE0MjU4NCwiZXhwIjoyMTA1NzE4NTg0fQ.aSJVk1R9cHIXgOHOkdTEo3lCHsUXy8FMfu6SsWTax9g';

function parseSqlInsert(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    const colMatch = content.match(/INSERT\s+INTO\s+(?:"[^"]+"|\S+)\s*\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) throw new Error(`Could not parse columns in ${filePath}`);

    const columns = colMatch[1].split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    const valuesIdx = content.indexOf('VALUES');
    const valuesStr = content.substring(valuesIdx + 6).trim();

    const rows = [];
    let current = '';
    let inString = false;
    let depth = 0;

    for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];
        const prevChar = i > 0 ? valuesStr[i - 1] : '';

        if (char === "'" && prevChar !== '\\') {
            if (inString && i + 1 < valuesStr.length && valuesStr[i + 1] === "'") {
                current += "''";
                i++;
            } else {
                inString = !inString;
                current += char;
            }
        } else if (char === '(' && !inString) {
            if (depth === 0) current = '';
            else current += char;
            depth++;
        } else if (char === ')' && !inString) {
            depth--;
            if (depth === 0) {
                rows.push(parseTuple(current, columns));
                current = '';
            } else {
                current += char;
            }
        } else {
            if (depth > 0) current += char;
        }
    }

    return { columns, rows };
}

function parseTuple(tupleStr, columns) {
    const vals = [];
    let cur = '';
    let inStr = false;
    let inArr = 0;

    for (let i = 0; i < tupleStr.length; i++) {
        const char = tupleStr[i];

        if (char === "'") {
            if (inStr && i + 1 < tupleStr.length && tupleStr[i + 1] === "'") {
                cur += "'";
                i++;
            } else {
                inStr = !inStr;
                cur += char;
            }
        } else if (char === '[' && !inStr) {
            inArr++;
            cur += char;
        } else if (char === ']' && !inStr) {
            inArr--;
            cur += char;
        } else if (char === ',' && !inStr && inArr === 0) {
            vals.push(cleanVal(cur.trim()));
            cur = '';
        } else {
            cur += char;
        }
    }
    if (cur.trim().length > 0 || vals.length < columns.length) {
        vals.push(cleanVal(cur.trim()));
    }

    const record = {};
    columns.forEach((col, idx) => {
        record[col] = vals[idx];
    });
    return record;
}

function cleanVal(val) {
    if (val === 'NULL' || val === 'null' || val === null || val === undefined) return null;
    if (typeof val === 'string' && val.startsWith("'") && val.endsWith("'")) {
        val = val.substring(1, val.length - 1).replace(/''/g, "'");
    }
    if (val === '') return null;
    if (typeof val === 'string' && val.startsWith('ARRAY[') && val.endsWith(']')) {
        const inner = val.substring(6, val.length - 1).trim();
        if (!inner) return [];
        return inner.split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) return Number(val);
    return val;
}

async function insertBatch(table, records, chunkSize = 50) {
    console.log(`Inserting ${records.length} records into ${table}...`);
    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates, return=minimal'
            },
            body: JSON.stringify(chunk)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to insert into ${table} (chunk starting at ${i}): ${res.status} ${res.statusText} - ${errText}`);
        }
    }
    console.log(`Successfully inserted/upserted into ${table}!`);
}

async function run() {
    try {
        // 1. Units
        const unitsData = parseSqlInsert('./public/m_units_rows.sql');
        const filteredUnits = unitsData.rows.filter(u => {
            const code = String(u.code || '').toUpperCase();
            const name = String(u.name || '').toUpperCase();
            return code !== 'ADMIN' && !name.includes('SUPERADMIN');
        }).map(u => ({
            id: u.id ?? null,
            code: u.code ?? null,
            name: u.name ?? null,
            proportion_percentage: u.proportion_percentage ?? 0,
            remuneration_style: u.remuneration_style ?? 'score_based',
            is_active: u.is_active ?? true,
            created_at: u.created_at ?? new Date().toISOString(),
            updated_at: u.updated_at ?? new Date().toISOString()
        }));
        console.log(`Filtered units (excluding superadmin): ${filteredUnits.length} rows`);
        await insertBatch('m_units', filteredUnits);

        // 2. Categories
        const categoriesData = parseSqlInsert('./public/m_kpi_categories_rows.sql');
        const categories = categoriesData.rows.map(c => ({
            id: c.id ?? null,
            unit_id: c.unit_id ?? null,
            category: c.category ?? null,
            category_name: c.category_name ?? null,
            weight_percentage: c.weight_percentage ?? 0,
            description: c.description ?? null,
            configuration_style: c.configuration_style ?? 'percentage',
            is_weighted: c.is_weighted ?? true,
            is_active: c.is_active ?? true,
            created_at: c.created_at ?? new Date().toISOString(),
            updated_at: c.updated_at ?? new Date().toISOString()
        }));
        await insertBatch('m_kpi_categories', categories);

        // 3. Indicators
        const indicatorsData = parseSqlInsert('./public/m_kpi_indicators_rows.sql');
        const indicators = indicatorsData.rows.map(i => ({
            id: i.id ?? null,
            category_id: i.category_id ?? null,
            code: i.code ?? null,
            name: i.name ?? null,
            target_value: i.target_value ?? 0,
            weight_percentage: i.weight_percentage ?? 0,
            measurement_unit: i.measurement_unit ?? null,
            description: i.description ?? null,
            calculation_method: i.calculation_method ?? 'indexing',
            base_index_value: i.base_index_value ?? 0,
            is_active: i.is_active ?? true,
            created_at: i.created_at ?? new Date().toISOString(),
            updated_at: i.updated_at ?? new Date().toISOString(),
            measurement_type: i.measurement_type ?? 'scoring',
            unit_tariff: i.unit_tariff ?? 0,
            service_types: Array.isArray(i.service_types) ? i.service_types : []
        }));
        await insertBatch('m_kpi_indicators', indicators);

        // 4. Sub-Indicators
        const subIndicatorsData = parseSqlInsert('./public/m_kpi_sub_indicators_rows.sql');
        const subIndicators = subIndicatorsData.rows.map(s => {
            let scoringCriteria = s.scoring_criteria;
            if (typeof scoringCriteria === 'string' && scoringCriteria.trim()) {
                try {
                    scoringCriteria = JSON.parse(scoringCriteria);
                } catch (e) {
                    console.warn(`Could not parse scoring_criteria for sub-indicator ${s.id}`);
                }
            } else if (!scoringCriteria) {
                scoringCriteria = null;
            }
            return {
                id: s.id ?? null,
                indicator_id: s.indicator_id ?? null,
                code: s.code ?? null,
                name: s.name ?? null,
                target_value: s.target_value ?? 0,
                weight_percentage: s.weight_percentage ?? 0,
                scoring_criteria: scoringCriteria,
                measurement_unit: s.measurement_unit ?? null,
                measurement_type: s.measurement_type ?? 'scoring',
                unit_tariff: s.unit_tariff ?? 0,
                base_index_value: s.base_index_value ?? 0,
                service_types: Array.isArray(s.service_types) ? s.service_types : [],
                description: s.description ?? null,
                is_active: s.is_active ?? true,
                created_at: s.created_at ?? new Date().toISOString(),
                updated_at: s.updated_at ?? new Date().toISOString()
            };
        });
        await insertBatch('m_kpi_sub_indicators', subIndicators);

        console.log('ALL DATA IMPORT COMPLETED SUCCESSFULLY!');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
