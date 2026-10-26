import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const kepUnitId = '0c186ef2-1cb2-46a6-b7c6-53d86b744dbb';

async function compareRawAssessments() {
  const { data: emps } = await sb.from('m_employees').select('id, nik, full_name').eq('unit_id', kepUnitId);
  const empIds = emps.map(e => e.id);

  // Fetch all assessments for Keperawatan in 2026-01
  let allAss = [];
  for (let i = 0; i < empIds.length; i += 20) {
    const chunk = empIds.slice(i, i + 20);
    const { data } = await sb
      .from('t_kpi_assessments')
      .select('id, employee_id, indicator_id, sub_indicator_id, revenue_type, realization_value, score, m_kpi_indicators(code, name, m_kpi_categories(category)), m_kpi_sub_indicators(id, indicator_id, code, name)')
      .eq('period', '2026-01')
      .in('employee_id', chunk);
    if (data) allAss.push(...data);
  }

  console.log(`Fetched ${allAss.length} raw assessment rows`);

  // Group by employee_id -> revenue_type -> indicator code + sub indicator name/code
  const empMap = new Map();
  for (const emp of emps) {
    empMap.set(emp.id, { emp, bpjs: new Map(), umum: new Map(), bpjsMain: new Map(), umumMain: new Map() });
  }

  for (const a of allAss) {
    const e = empMap.get(a.employee_id);
    if (!e) continue;
    const cat = a.m_kpi_indicators?.m_kpi_categories?.category;
    if (cat === 'P3') continue; // P3 is only in BPJS, skip for P1/P2 comparison
    const indCode = a.m_kpi_indicators?.code;
    const subName = a.m_kpi_sub_indicators?.name || 'MAIN';
    const key = `${cat}:${indCode}:${subName}`;

    // Note: check if sub_indicator matches indicator
    const isSubMismatched = a.sub_indicator_id && a.indicator_id !== a.m_kpi_sub_indicators?.indicator_id;

    if (a.revenue_type === 'bpjs') {
      if (!e.bpjs.has(key)) e.bpjs.set(key, []);
      e.bpjs.get(key).push({ ...a, isSubMismatched });
    } else if (a.revenue_type === 'umum') {
      if (!e.umum.has(key)) e.umum.set(key, []);
      e.umum.get(key).push({ ...a, isSubMismatched });
    }
  }

  console.log('\n--- Checking Differences ---');
  let countWithDuplicates = 0;
  let countWithDifferentValues = 0;

  for (const [empId, data] of empMap.entries()) {
    let hasDup = false;
    let hasDiffVal = false;
    const diffs = [];

    // Check UMUM for duplicates or mismatches
    for (const [key, rows] of data.umum.entries()) {
      if (rows.length > 1) {
        hasDup = true;
      }
      const bpjsRows = data.bpjs.get(key) || [];
      const validUmumRows = rows.filter(r => !r.isSubMismatched);
      const validBpjsRows = bpjsRows.filter(r => !r.isSubMismatched);

      const umumVal = validUmumRows[0]?.realization_value;
      const bpjsVal = validBpjsRows[0]?.realization_value;

      if (validUmumRows.length > 0 && validBpjsRows.length > 0 && Number(umumVal) !== Number(bpjsVal)) {
        hasDiffVal = true;
        diffs.push(`${key}: BPJS=${bpjsVal} vs UMUM=${umumVal}`);
      }
    }

    if (hasDup) {
      countWithDuplicates++;
      console.log(`[DUPLICATE] [${data.emp.nik}] ${data.emp.full_name}`);
    }
    if (hasDiffVal) {
      countWithDifferentValues++;
      console.log(`[DIFFERENT VALUE] [${data.emp.nik}] ${data.emp.full_name}: ${diffs.join(', ')}`);
    }
  }

  console.log(`\nTotal employees with duplicates in UMUM: ${countWithDuplicates}`);
  console.log(`Total employees with genuinely different realization values: ${countWithDifferentValues}`);
}

compareRawAssessments().catch(console.error);
