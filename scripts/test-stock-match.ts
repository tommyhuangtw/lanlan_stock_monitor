/**
 * Stock lookup regression check.
 *
 * Guards the two substring-matching paths in shared-queries.ts that both the
 * LINE and Telegram webhooks route through. A 1-char query used to match any
 * ticker/name containing that letter (/T returned Costco).
 *
 * Run: npx tsx scripts/test-stock-match.ts
 */
import 'dotenv/config';
import assert from 'node:assert';
import { fetchStockDetail } from '../lib/notifications/shared-queries';

async function lookup(query: string): Promise<string> {
  const d = await fetchStockDetail(query);
  if (!d) return '無結果';
  return d.type === 'watchlist' ? d.stock.ticker : `KOL觀點(${d.opinions.length})`;
}

async function main() {
  let failed = 0;

  // A single character must never resolve — too loose to be meaningful.
  for (const q of ['T', 'A', 'M', '2']) {
    const got = await lookup(q);
    try {
      assert.strictEqual(got, '無結果');
      console.log(`  ✅ 「${q}」→ 無結果`);
    } catch {
      console.error(`  ❌ 「${q}」→ ${got}（單字元不該有結果）`);
      failed++;
    }
  }

  // Real queries must still resolve. Ticker/name pairs that exist on the watchlist.
  for (const [q, want] of [['2330', '2330'], ['台積電', '2330']] as const) {
    const got = await lookup(q);
    try {
      assert.ok(got.includes(want));
      console.log(`  ✅ 「${q}」→ ${got}`);
    } catch {
      console.error(`  ❌ 「${q}」→ ${got}（應含 ${want}）`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} 項失敗`);
    process.exit(1);
  }
  console.log('\n全部通過');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
