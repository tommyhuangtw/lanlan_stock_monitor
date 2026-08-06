/**
 * 股癌 new-episode watcher — runs hourly, independent of the daily pipeline.
 *
 * Only the 股癌 feed is polled, so an off-hour run never pulls other sources
 * forward. Transcription/analysis reuse the shared steps: they are idempotent
 * (jobs move pending → processing, analyses skip episodes already analysed),
 * and the daily digest selects episodes by published_at, not by when they were
 * analysed — so doing this work early changes nothing about the email.
 *
 * Flags: --dry-run (build the LINE text, don't send)  --force (re-push)
 *        --self-check (offline formatter check, no network)
 */

import 'dotenv/config';
import { fetchFeeds } from '../lib/pipeline/fetch-feeds';
import { transcribeAll } from '../lib/pipeline/transcribe';
import { analyzeAll } from '../lib/pipeline/analyze';
import { sendGooayeAlert, formatBrief, GOOAYE_SOURCE_ID, GooayeBrief } from '../lib/notifications/gooaye-alert';
import { supabaseAdmin } from '../lib/supabase';

function selfCheck() {
  const brief: GooayeBrief = {
    oneLiner: '風險意識拉高，但不空手',
    positions: [
      { ticker: 'NVDA', name: '輝達', view: 'bullish', action: '拉回有加，但不追高', level: '160 附近' },
      { ticker: '2330', name: '台積電', view: 'neutral', action: '續抱，不加碼', level: '' },
    ],
    trends: ['AI 資本支出還在，但市場開始挑對象'],
    playbook: ['部位分批進，不要一次全押'],
  };
  const text = formatBrief(brief, '2026/08/06 (四) 測試集', '2026-08-06T01:15:35+00:00');

  console.assert(text.includes('（8/6）'), 'date missing');
  console.assert(text.includes('🟢 NVDA 輝達'), 'position line missing');
  console.assert(text.includes('｜160 附近'), 'price level missing');
  console.assert(!text.includes('續抱，不加碼｜'), 'empty level should not add a separator');
  console.assert(text.includes('🧠 操作心法'), 'playbook section missing');

  // Empty sections must not leave dangling headers.
  const bare = formatBrief({ oneLiner: '', positions: [], trends: [], playbook: [] }, 'EP', 'not-a-date');
  console.assert(!bare.includes('📌') && !bare.includes('📈') && !bare.includes('🧠'), 'empty sections leaked');
  console.assert(!bare.includes('（'), 'bad date leaked');

  console.log(text);
  console.log('\n--- self-check passed ---');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) return selfCheck();

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  // Skip the whole run when the newest episode has already been pushed and no
  // newer one is in the feed — checked after the fetch, which is one HTTP call.
  const feed = await fetchFeeds([GOOAYE_SOURCE_ID]);
  if (feed.errors.length > 0) console.error('  fetch errors:', feed.errors);
  console.log(`  股癌 feed: ${feed.newEpisodes} new episode(s)`);

  const { data: latest } = await supabaseAdmin
    .from('episodes')
    .select('id, title, line_pushed_at')
    .eq('source_id', GOOAYE_SOURCE_ID)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return console.log('  no 股癌 episode found, nothing to do');
  if (latest.line_pushed_at && !force) {
    return console.log(`  latest episode already pushed (${latest.line_pushed_at}), nothing to do`);
  }

  console.log(`  working on: ${latest.title}`);
  const t = await transcribeAll();
  console.log(`  transcribe — submitted: ${t.assemblyai.submitted}, completed: ${t.assemblyai.completed}, failed: ${t.assemblyai.failed}`);
  if (t.errors.length > 0) console.error('  transcribe errors:', t.errors);

  const a = await analyzeAll();
  console.log(`  analyze — analyzed: ${a.analyzed}, skipped: ${a.skipped}`);
  if (a.errors.length > 0) console.error('  analyze errors:', a.errors);

  const result = await sendGooayeAlert({ dryRun, force });
  console.log(`  push: ${result.pushed ? 'sent' : `skipped (${result.reason})`}`);
  if (result.text) console.log(`\n${result.text}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
