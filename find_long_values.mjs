import fs from 'fs';

function parseSqlInsert(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    const colMatch = content.match(/INSERT\s+INTO\s+(?:"[^"]+"|\S+)\s*\(([^)]+)\)\s*VALUES/i);
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
            inString = !inString;
            current += char;
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
        const prev = i > 0 ? tupleStr[i - 1] : '';

        if (char === "'" && (prev !== "'" || !inStr)) {
            if (inStr && i + 1 < tupleStr.length && tupleStr[i + 1] === "'") {
                cur += "'";
                i++;
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
    if (typeof val === 'string' && val.startsWith("'") && val.endsWith("'")) {
        return val.substring(1, val.length - 1).replace(/''/g, "'");
    }
    if (typeof val === 'string' && val.startsWith('ARRAY[') && val.endsWith(']')) {
        const inner = val.substring(6, val.length - 1).trim();
        if (!inner) return [];
        return inner.split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val)) && typeof val !== 'boolean') return Number(val);
    return val;
}

const subIndicatorsData = parseSqlInsert('./public/m_kpi_sub_indicators_rows.sql');
subIndicatorsData.rows.forEach((row, idx) => {
    for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'string') {
            if (k === 'code' && v.length > 50) {
                console.log(`Row ${idx} id=${row.id} code length ${v.length} > 50: "${v}"`);
            }
            if (k === 'measurement_unit' && v.length > 50) {
                console.log(`Row ${idx} id=${row.id} measurement_unit length ${v.length} > 50: "${v}"`);
            }
            if (k === 'measurement_type' && v.length > 20) {
                console.log(`Row ${idx} id=${row.id} measurement_type length ${v.length} > 20: "${v}"`);
            }
        }
    }
});
