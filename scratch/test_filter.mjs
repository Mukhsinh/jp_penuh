import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const kepUnitId = '0c186ef2-1cb2-46a6-b7c6-53d86b744dbb';

async function testFilter() {
  // Check the 13 employees
  const { data: emps } = await sb.from('m_employees').select('id, nik, full_name').eq('unit_id', kepUnitId);
  const targetNiks = ['PEG067', 'PEG069', 'PEG073', 'PEG001', 'PEG080', 'PEG082', 'PEG083', 'PEG086', 'PEG193', 'PEG006', 'PEG212', 'PEG018'];
  const targetEmps = emps.filter(e => targetNiks.includes(e.nik));

  console.log(`Checking ${targetEmps.length} target employees with filter applied...`);

  // Let's test Anetri Oktofiya
  const anetri = emps.find(e => e.nik === 'PEG067');
  console.log('Anetri ID:', anetri.id);

  // Fetch UMUM assessments for Anetri
  const { data: subAss } = await sb
    .from('t_kpi_assessments')
    .select('id, employee_id, indicator_id, score, realization_value, sub_indicator_id, revenue_type, m_kpi_sub_indicators(id, indicator_id, measurement_type, base_index_value, weight_percentage)')
    .eq('period', '2026-01')
    .eq('revenue_type', 'umum')
    .eq('employee_id', anetri.id)
    .not('sub_indicator_id', 'is', null);

  console.log(`Anetri raw UMUM sub-assessments: ${subAss.length}`);
  const filteredSub = subAss.filter(s => {
    if (s.m_kpi_sub_indicators?.indicator_id && s.m_kpi_sub_indicators.indicator_id !== s.indicator_id) {
      return false;
    }
    return true;
  });
  console.log(`Anetri filtered UMUM sub-assessments: ${filteredSub.length}`);

  // Now calculate subScoreMap for Anetri with filteredSub
  const subScoreMap = new Map();
  for (const sub of filteredSub) {
    const key = `${sub.employee_id}:${sub.indicator_id}`;
    const weight = Number(sub.m_kpi_sub_indicators?.weight_percentage || 0);
    const rawScore = Number(sub.score !== undefined && sub.score !== null && sub.score !== 0 ? sub.score : sub.realization_value || 0);
    const eff = rawScore * (weight / 100);
    const existing = subScoreMap.get(key);
    if (existing) {
      existing.score += eff;
    } else {
      subScoreMap.set(key, { score: eff });
    }
  }

  console.log('Anetri subScoreMap:');
  for (const [k, v] of subScoreMap.entries()) {
    console.log(`  ${k}: ${v.score}`);
  }
}

testFilter().catch(console.error);
