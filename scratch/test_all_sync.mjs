import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const kepUnitId = '0c186ef2-1cb2-46a6-b7c6-53d86b744dbb';

async function testAllSync() {
  const { data: emps } = await sb.from('m_employees').select('id, nik, full_name').eq('unit_id', kepUnitId).eq('is_active', true).neq('role', 'superadmin');
  const empIds = emps.map(e => e.id);

  for (const rev of ['bpjs', 'umum']) {
    console.log(`\n================ Testing ${rev.toUpperCase()} ================`);
    const { data: categories } = await sb
      .from('m_kpi_categories')
      .select('*, indicators:m_kpi_indicators(*, m_kpi_sub_indicators(*))')
      .eq('unit_id', kepUnitId)
      .eq('revenue_type', rev);

    let allAss = [];
    for (let i = 0; i < empIds.length; i += 20) {
      const chunk = empIds.slice(i, i + 20);
      const { data } = await sb
        .from('t_kpi_assessments')
        .select('id, employee_id, indicator_id, sub_indicator_id, revenue_type, realization_value, score, m_kpi_sub_indicators(id, indicator_id, weight_percentage)')
        .eq('period', '2026-01')
        .eq('revenue_type', rev)
        .in('employee_id', chunk);
      if (data) allAss.push(...data);
    }

    // Filter out invalid zombie rows:
    const cleanAss = allAss.filter(a => {
      if (a.sub_indicator_id && a.m_kpi_sub_indicators?.indicator_id && a.m_kpi_sub_indicators.indicator_id !== a.indicator_id) {
        return false;
      }
      return true;
    });

    let totalP1 = 0;
    let totalP2 = 0;

    for (const emp of emps) {
      const empAsses = cleanAss.filter(a => a.employee_id === emp.id);

      const p1Cat = categories.find(c => c.category === 'P1');
      const p2Cat = categories.find(c => c.category === 'P2');

      const calcCat = (cat) => {
        if (!cat) return 0;
        let totReal = 0;
        cat.indicators.forEach(ind => {
          const ass = empAsses.find(a => a.indicator_id === ind.id && !a.sub_indicator_id);
          const subAss = empAsses.filter(a => a.indicator_id === ind.id && a.sub_indicator_id);
          let real = 0;
          if (subAss.length > 0) {
            subAss.forEach(sa => {
              const subConf = ind.m_kpi_sub_indicators?.find(si => si.id === sa.sub_indicator_id);
              if (subConf) {
                real += Number(sa.realization_value) * (subConf.weight_percentage / 100);
              }
            });
          } else if (ass) {
            real = Number(ass.realization_value);
          }
          totReal += real * (ind.weight_percentage / 100);
        });
        return Number(((totReal / 100) * cat.weight_percentage).toFixed(2));
      };

      const p1 = calcCat(p1Cat);
      const p2 = calcCat(p2Cat);
      totalP1 += p1;
      totalP2 += p2;
    }

    console.log(`[CLEAN RESULT] ${rev.toUpperCase()} Total P1: ${totalP1.toFixed(2)}, Total P2: ${totalP2.toFixed(2)}, Total: ${(totalP1 + totalP2).toFixed(2)}`);
  }
}

testAllSync().catch(console.error);
