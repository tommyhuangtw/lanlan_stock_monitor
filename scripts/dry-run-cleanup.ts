/**
 * Dry run of the watchlist cleanup in scripts/stock-monitor.ts.
 *
 * Applies the same three rules in the same order and prints what would be
 * archived. Classification results are written back (they're a cached fact,
 * not a decision), but no stock's status is changed.
 *
 * Run: npx tsx scripts/dry-run-cleanup.ts [--save-classification]
 */
import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';
import { fetchSectorProfile } from '../lib/stock-data';
import { classifyTechStocks } from '../lib/openrouter';

const CAPS = { TW: 40, US: 50 } as const;

async function main() {
  const save = process.argv.includes('--save-classification');
  console.log(`=== 清理 Dry Run${save ? '（會寫入分類結果，不改變 status）' : '（完全不寫入）'} ===\n`);

  const { data: stocks } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('id, ticker, ticker_normalized, name, market, mention_count, last_mentioned_at, consecutive_fetch_failures, is_tech, tech_reason, sector, industry')
    .eq('status', 'active');

  const all = stocks || [];
  console.log(`目前活躍：${all.length} 檔（US ${all.filter(s => s.market === 'US').length} / TW ${all.filter(s => s.market === 'TW').length}）\n`);

  // Classify anything not yet judged — same batching the monitor uses.
  const unjudged = all.filter(s => s.is_tech === null || s.is_tech === undefined);
  if (unjudged.length > 0) {
    console.log(`--- 分類 ${unjudged.length} 檔 ---`);
    for (let i = 0; i < unjudged.length; i += 5) {
      const batch = unjudged.slice(i, i + 5);
      const profiles = await Promise.all(batch.map(s => fetchSectorProfile(s.ticker_normalized)));
      const verdicts = await classifyTechStocks(
        batch.map((s, j) => ({ ticker: s.ticker, name: s.name, sector: profiles[j].sector, industry: profiles[j].industry, summary: profiles[j].summary }))
      );
      batch.forEach((s, j) => {
        s.is_tech = verdicts[j].tech;
        s.tech_reason = verdicts[j].reason;
        s.sector = profiles[j].sector;
        s.industry = profiles[j].industry;
      });
      if (save) {
        await Promise.all(batch.map((s, j) =>
          verdicts[j].ok
            ? supabaseAdmin.from('watchlist_stocks').update({
                sector: profiles[j].sector, industry: profiles[j].industry,
                is_tech: verdicts[j].tech, tech_reason: verdicts[j].reason,
                sector_checked_at: new Date().toISOString(),
              }).eq('id', s.id)
            : Promise.resolve()
        ));
      }
      process.stdout.write(`  ${Math.min(i + 5, unjudged.length)}/${unjudged.length}\r`);
    }
    console.log(`  ${unjudged.length}/${unjudged.length} 完成\n`);
  }

  const archived: Array<{ ticker: string; reason: string }> = [];
  let survivors = [...all];

  // Rule 1 — repeated price-fetch failures
  const failing = survivors.filter(s => (s.consecutive_fetch_failures || 0) >= 7);
  for (const s of failing) archived.push({ ticker: s.ticker, reason: `連續 ${s.consecutive_fetch_failures} 次無法取得價格` });
  survivors = survivors.filter(s => !failing.includes(s));

  // Rule 1b — non-tech
  const nonTech = survivors.filter(s => s.is_tech === false);
  for (const s of nonTech) archived.push({ ticker: s.ticker, reason: `非科技股（${s.tech_reason || '?'}）` });
  survivors = survivors.filter(s => !nonTech.includes(s));

  // Rules 2/3 — market caps, oldest mention first (nulls first), same as the monitor
  const overflow: typeof survivors = [];
  for (const market of ['TW', 'US'] as const) {
    const inMarket = survivors.filter(s => s.market === market);
    const excess = inMarket.length - CAPS[market];
    if (excess <= 0) continue;
    const sorted = [...inMarket].sort((a, b) => {
      if (!a.last_mentioned_at) return -1;
      if (!b.last_mentioned_at) return 1;
      return a.last_mentioned_at.localeCompare(b.last_mentioned_at);
    });
    for (const s of sorted.slice(0, excess)) {
      overflow.push(s);
      archived.push({ ticker: s.ticker, reason: `${market === 'TW' ? '台股' : '美股'}超過 ${CAPS[market]} 檔上限` });
    }
  }
  survivors = survivors.filter(s => !overflow.includes(s));

  const show = (title: string, rows: Array<{ ticker: string; reason: string }>) => {
    if (rows.length === 0) return;
    console.log(`\n${title}（${rows.length} 檔）`);
    for (const r of rows) console.log(`   ${r.ticker.padEnd(20)} ${r.reason}`);
  };
  show('❌ 抓價失敗', archived.filter(a => a.reason.includes('無法取得價格')));
  show('🗑 非科技股', archived.filter(a => a.reason.startsWith('非科技')));
  show('📦 超過上限', archived.filter(a => a.reason.includes('上限')));

  console.log(`\n=== 結果 ===`);
  console.log(`封存 ${archived.length} 檔 → 剩下 ${survivors.length} 檔`);
  for (const market of ['US', 'TW'] as const) {
    const keep = survivors.filter(s => s.market === market);
    console.log(`\n${market === 'US' ? '🇺🇸 美股' : '🇹🇼 台股'} 保留 ${keep.length} 檔（上限 ${CAPS[market]}）：`);
    console.log('  ' + keep.map(s => s.ticker).join(', '));
  }
  console.log(`\n※ 這是模擬，沒有變更任何 status。`);
}

main().catch(e => { console.error(e); process.exit(1); });
