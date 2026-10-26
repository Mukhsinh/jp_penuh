import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
  let allSubs = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const to = from + 999;
    const { data } = await sb
      .from('t_kpi_assessments')
      .select('id, employee_id, indicator_id, sub_indicator_id, revenue_type, realization_value, m_kpi_sub_indicators(id, indicator_id, name, code)')
      .eq('period', '2026-01')
      .not('sub_indicator_id', 'is', null)
      .range(from, to);
    if (!data || data.length === 0) break;
    allSubs.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  const invalidRows = allSubs.filter(m => m.indicator_id !== m.m_kpi_sub_indicators?.indicator_id);
  const validRows = allSubs.filter(m => m.indicator_id === m.m_kpi_sub_indicators?.indicator_id);

  console.log(`Total: ${allSubs.length}, Invalid: ${invalidRows.length}, Valid: ${validRows.length}`);

  let hasValidCounterpartCount = 0;
  for (const inv of invalidRows) {
    // Find valid row for same employee, same indicator_id
    const counterpart = validRows.find(v => v.employee_id === inv.employee_id && v.indicator_id === inv.indicator_id && v.revenue_type === inv.revenue_type);
    if (counterpart) {
      hasValidCounterpartCount++;
    } else {
      console.log(`NO VALID COUNTERPART for inv: emp=${inv.employee_id}, ind=${inv.indicator_id}`);
    }
  }

  console.log(`Invalid rows with valid counterpart: ${hasValidCounterpartCount} / ${invalidRows.length}`);
}

verify().catch(console.error);
