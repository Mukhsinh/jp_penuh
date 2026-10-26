import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const kepUnitId = '0c186ef2-1cb2-46a6-b7c6-53d86b744dbb';

async function check() {
  const { data: emps } = await sb.from('m_employees').select('id, nik, full_name').eq('unit_id', kepUnitId);
  const empIds = emps.map(e => e.id);

  let allSubs = [];
  for (let i = 0; i < empIds.length; i += 20) {
    const chunk = empIds.slice(i, i + 20);
    const { data: subs } = await sb
      .from('t_kpi_assessments')
      .select('id, employee_id, indicator_id, sub_indicator_id, revenue_type, m_kpi_sub_indicators(id, indicator_id, name, code), m_kpi_indicators(id, name, code, category_id, m_kpi_categories(unit_id, revenue_type))')
      .eq('period', '2026-01')
      .not('sub_indicator_id', 'is', null)
      .in('employee_id', chunk);
    if (subs) allSubs.push(...subs);
  }

  console.log('Total Keperawatan sub-assessment rows in 2026-01:', allSubs.length);

  let mismatchCount = 0;
  const mismatched = [];
  for (const s of allSubs) {
    const indIdInAss = s.indicator_id;
    const indIdInSub = s.m_kpi_sub_indicators?.indicator_id;
    if (indIdInAss !== indIdInSub) {
      mismatchCount++;
      mismatched.push(s);
    }
  }

  console.log('Mismatched indicator_id between assessment and sub_indicator:', mismatchCount);
  if (mismatchCount > 0) {
    console.log('Sample mismatches (first 5):');
    mismatched.slice(0, 5).forEach(m => {
      console.log(`  Ass ID: ${m.id}, emp: ${m.employee_id}, rev: ${m.revenue_type}`);
      console.log(`    Ass ind: ${m.indicator_id} (${m.m_kpi_indicators?.code} ${m.m_kpi_indicators?.name})`);
      console.log(`    Sub ind: ${m.m_kpi_sub_indicators?.indicator_id} (${m.m_kpi_sub_indicators?.code} ${m.m_kpi_sub_indicators?.name})`);
    });

    const affectedEmpIds = [...new Set(mismatched.map(m => m.employee_id))];
    console.log(`Affected employees count: ${affectedEmpIds.length}`);
    const affectedEmps = emps.filter(e => affectedEmpIds.includes(e.id));
    console.log('Affected employees:', affectedEmps.map(e => `[${e.nik}] ${e.full_name}`));
  }
}

check().catch(console.error);
