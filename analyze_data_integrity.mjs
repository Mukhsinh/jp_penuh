import fs from 'fs';

// Helper to parse SQL INSERT statement values
function parseSqlInsert(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    // Find column list inside INSERT INTO ... (...) VALUES
    const colMatch = content.match(/INSERT\s+INTO\s+(?:"[^"]+"|\S+)\s*\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) throw new Error(`Could not parse columns in ${filePath}`);

    const columns = colMatch[1].split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    // Extract values part after VALUES
    const valuesIdx = content.indexOf('VALUES');
    const valuesStr = content.substring(valuesIdx + 6).trim();

    // Custom tokenizer for SQL value tuples: ('val1', 'val2', NULL, ARRAY[...])
    const rows = [];
    let current = '';
    let inString = false;
    let inArray = false;
    let depth = 0;

    for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];
        const prevChar = i > 0 ? valuesStr[i - 1] : '';

        if (char === "'" && prevChar !== '\\') {
            inString = !inString;
            current += char;
        } else if (char === '(' && !inString) {
            if (depth === 0) {
                current = '';
            } else {
                current += char;
            }
            depth++;
        } else if (char === ')' && !inString) {
            depth--;
            if (depth === 0) {
                // Parse current row tuple into values
                rows.push(parseTuple(current, columns));
                current = '';
            } else {
                current += char;
            }
        } else {
            if (depth > 0) {
                current += char;
            }
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
        const prev = i > 0 ? tupleStr[i - 1] : '';

        if (char === "'" && (prev !== "'" || !inStr)) {
            // Handle escaped single quote in SQL ('' inside single quote)
            if (inStr && i + 1 < tupleStr.length && tupleStr[i + 1] === "'") {
                cur += "'";
                i++; // skip next quote
            } else {
                inStr = !inStr;
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
    if (val.startsWith("'") && val.endsWith("'")) {
        return val.substring(1, val.length - 1).replace(/''/g, "'");
    }
    if (val.startsWith('ARRAY[') && val.endsWith(']')) {
        const inner = val.substring(6, val.length - 1).trim();
        if (!inner) return [];
        return inner.split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val))) return Number(val);
    return val;
}

const unitsParsed = parseSqlInsert('./public/m_units_rows.sql');
const categoriesParsed = parseSqlInsert('./public/m_kpi_categories_rows.sql');
const indicatorsParsed = parseSqlInsert('./public/m_kpi_indicators_rows.sql');
const subIndicatorsParsed = parseSqlInsert('./public/m_kpi_sub_indicators_rows.sql');

console.log('--- SUMMARY OF PARSED DATA ---');
console.log(`Units: ${unitsParsed.rows.length} rows`);
console.log(`Categories: ${categoriesParsed.rows.length} rows`);
console.log(`Indicators: ${indicatorsParsed.rows.length} rows`);
console.log(`Sub-Indicators: ${subIndicatorsParsed.rows.length} rows`);

const unitIds = new Set(unitsParsed.rows.map(u => u.id));
console.log('\n--- CHECKING SUPERADMIN IN UNITS ---');
const superadminUnits = unitsParsed.rows.filter(u => u.code === 'ADMIN' || u.name.toUpperCase().includes('SUPERADMIN'));
console.log('Superadmin rows in SQL:', superadminUnits);

console.log('\n--- CHECKING CATEGORY FKs (unit_id) ---');
let invalidCatFks = 0;
categoriesParsed.rows.forEach(c => {
    if (!unitIds.has(c.unit_id)) {
        console.log(`Category ID ${c.id} has invalid unit_id ${c.unit_id}`);
        invalidCatFks++;
    }
});
console.log(`Invalid category unit_ids: ${invalidCatFks}`);

const categoryIds = new Set(categoriesParsed.rows.map(c => c.id));
console.log('\n--- CHECKING INDICATOR FKs (category_id) ---');
let invalidIndFks = 0;
indicatorsParsed.rows.forEach(ind => {
    if (!categoryIds.has(ind.category_id)) {
        console.log(`Indicator ID ${ind.id} (${ind.name}) has invalid category_id ${ind.category_id}`);
        invalidIndFks++;
    }
});
console.log(`Invalid indicator category_ids: ${invalidIndFks}`);

const indicatorIds = new Set(indicatorsParsed.rows.map(ind => ind.id));
console.log('\n--- CHECKING SUB-INDICATOR FKs (indicator_id) ---');
let invalidSubFks = 0;
subIndicatorsParsed.rows.forEach(sub => {
    if (!indicatorIds.has(sub.indicator_id)) {
        console.log(`Sub-Indicator ID ${sub.id} (${sub.name}) has invalid indicator_id ${sub.indicator_id}`);
        invalidSubFks++;
    }
});
console.log(`Invalid sub-indicator indicator_ids: ${invalidSubFks}`);
