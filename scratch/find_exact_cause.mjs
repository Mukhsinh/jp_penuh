import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const kepUnitId = '0c186ef2-1cb2-46a6-b7c6-53d86b744dbb';

const payload = {
  sub: '3f41ec96-bfb2-4d24-baa5-63eb86c51473',
  email: 'admin@sungaipenuh.com',
  role: 'superadmin',
  exp: Math.floor(Date.now() / 1000) + 3600
};
const header = { alg: 'HS256', typ: 'JWT' };
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const token = `${b64(header)}.${b64(payload)}.mocksignature`;

async function findExactCause() {
  console.log('Fetching BPJS report...');
  const repBpjsRes = await fetch('http://localhost:3002/api/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ reportType: 'incentive', period: '2026-01', unitId: kepUnitId, revenueType: 'bpjs', detailLevel: 'summary' })
  });
  const repBpjs = await repBpjsRes.json();

  console.log('Fetching UMUM report...');
  const repUmumRes = await fetch('http://localhost:3002/api/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ reportType: 'incentive', period: '2026-01', unitId: kepUnitId, revenueType: 'umum', detailLevel: 'summary' })
  });
  const repUmum = await repUmumRes.json();

  const bpjsData = repBpjs.data || [];
  const umumData = repUmum.data || [];

  console.log(`BPJS count: ${bpjsData.length}, UMUM count: ${umumData.length}`);

  let sumBpjsP1 = 0, sumBpjsP2 = 0;
  bpjsData.forEach(r => { sumBpjsP1 += Number(r.p1_score || 0); sumBpjsP2 += Number(r.p2_score || 0); });
  console.log(`BPJS sum: P1=${sumBpjsP1.toFixed(2)}, P2=${sumBpjsP2.toFixed(2)}`);

  let sumUmumP1 = 0, sumUmumP2 = 0;
  umumData.forEach(r => { sumUmumP1 += Number(r.p1_score || 0); sumUmumP2 += Number(r.p2_score || 0); });
  console.log(`UMUM sum: P1=${sumUmumP1.toFixed(2)}, P2=${sumUmumP2.toFixed(2)}`);

  const diffs = [];
  const umumMap = new Map(umumData.map(r => [r.employee_id, r]));

  for (const b of bpjsData) {
    const u = umumMap.get(b.employee_id);
    if (!u) {
      console.log(`Employee ${b.employee_name} (${b.employee_id}) missing in UMUM!`);
      continue;
    }
    const p1Diff = Math.abs(b.p1_score - u.p1_score);
    const p2Diff = Math.abs(b.p2_score - u.p2_score);
    if (p1Diff > 0.001 || p2Diff > 0.001) {
      diffs.push({
        name: b.employee_name,
        id: b.employee_id,
        nik: b.employee_code,
        bpjs: { p1: b.p1_score, p2: b.p2_score, tot: b.total_score },
        umum: { p1: u.p1_score, p2: u.p2_score, tot: u.total_score }
      });
    }
  }

  console.log(`\nFound ${diffs.length} employees with different P1 or P2:`);
  for (const d of diffs.slice(0, 15)) {
    console.log(`[${d.nik}] ${d.name}:`);
    console.log(`   BPJS: P1=${d.bpjs.p1}, P2=${d.bpjs.p2}`);
    console.log(`   UMUM: P1=${d.umum.p1}, P2=${d.umum.p2}`);
  }

  // Now, pick the first employee with a diff, and inspect their raw assessments in DB
  if (diffs.length > 0) {
    const sample = diffs[0];
    console.log(`\n=== Deep Dive into Sample Employee: ${sample.name} (${sample.id}) ===`);
    const { data: rawAss } = await sb
      .from('t_kpi_assessments')
      .select('id, indicator_id, sub_indicator_id, revenue_type, score, realization_value, m_kpi_indicators(code, name, category_id, calculation_method, m_kpi_categories(category, revenue_type))')
      .eq('employee_id', sample.id)
      .eq('period', '2026-01');

    console.log('Raw assessments:');
    for (const a of rawAss) {
      console.log(`  rev=${a.revenue_type} | cat=${a.m_kpi_indicators?.m_kpi_categories?.category}(${a.m_kpi_indicators?.m_kpi_categories?.revenue_type}) | ind=${a.m_kpi_indicators?.code} ${a.m_kpi_indicators?.name} | sub=${a.sub_indicator_id ? 'YES' : 'NO'} | score=${a.score} | real=${a.realization_value}`);
    }
  }
}

findExactCause().catch(console.error);
