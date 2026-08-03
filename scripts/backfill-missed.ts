/**
 * Backfill episodes whose transcription failed.
 *
 * Re-queues failed jobs, transcribes, analyses, and refreshes the watchlist.
 * Deliberately does NOT touch generateDigest or sendEmails — backfilled
 * content should reach LINE queries without re-sending any daily brief.
 *
 * Sources that fail every episode (no captions available) are skipped: retrying
 * them burns API calls to produce the same failure.
 *
 * Run: npx tsx scripts/backfill-missed.ts [--days 14] [--apply]
 */
import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';
import { transcribeAll } from '../lib/pipeline/transcribe';
import { analyzeAll } from '../lib/pipeline/analyze';
import { populateWatchlist } from '../lib/pipeline/populate-watchlist';

/** Sources with a hopeless success rate — retrying can't help them. */
const SKIP_SOURCES = ['陽光財經'];

async function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 14;
  const apply = args.includes('--apply');

  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  console.log(`=== Backfill (past ${days} days${apply ? '' : ' — DRY RUN'}) ===\n`);

  const { data: episodes } = await supabaseAdmin
    .from('episodes')
    .select('id, title, source_id, published_at')
    .gte('published_at', cutoff);

  const { data: sources } = await supabaseAdmin.from('sources').select('id, name');
  const sourceName = new Map((sources || []).map(s => [s.id, s.name]));

  const episodeById = new Map((episodes || []).map(e => [e.id, e]));

  const { data: failed } = await supabaseAdmin
    .from('transcription_jobs')
    .select('id, episode_id, provider')
    .eq('status', 'failed')
    .in('episode_id', [...episodeById.keys()]);

  const retry: Array<{ id: number; label: string }> = [];
  const skipped: string[] = [];

  for (const job of failed || []) {
    const ep = episodeById.get(job.episode_id);
    const name = sourceName.get(ep?.source_id) || '?';
    const label = `${name}｜${(ep?.title || '').slice(0, 40)}`;
    if (SKIP_SOURCES.some(s => name.includes(s))) skipped.push(label);
    else retry.push({ id: job.id, label });
  }

  console.log(`要重跑：${retry.length} 集`);
  for (const r of retry) console.log(`   ${r.label}`);
  if (skipped.length) {
    console.log(`\n跳過（來源長期無字幕）：${skipped.length} 集`);
    for (const s of skipped) console.log(`   ${s}`);
  }

  if (!apply) {
    console.log('\n(dry run — 加 --apply 才會實際執行)');
    return;
  }
  if (retry.length === 0) {
    console.log('\n沒有要補的集數。');
    return;
  }

  console.log('\n--- 重置為 pending ---');
  const { error } = await supabaseAdmin
    .from('transcription_jobs')
    .update({ status: 'pending', error_message: null })
    .in('id', retry.map(r => r.id));
  if (error) throw new Error(`Reset failed: ${error.message}`);
  console.log(`已重置 ${retry.length} 個 job`);

  console.log('\n--- 轉錄 ---');
  const t = await transcribeAll();
  console.log(`AssemblyAI 完成 ${t.assemblyai.completed} / 失敗 ${t.assemblyai.failed}`);
  console.log(`Apify 完成 ${t.apify.completed} / 失敗 ${t.apify.failed}`);
  for (const e of t.errors) console.log(`   ⚠️ ${e}`);

  console.log('\n--- 分析 ---');
  const a = await analyzeAll();
  console.log(`已分析 ${a.analyzed} / 略過 ${a.skipped}`);
  for (const e of a.errors) console.log(`   ⚠️ ${e}`);

  console.log('\n--- 更新監控池 ---');
  // Bypass the digest: today's was built before these episodes were transcribed.
  const w = await populateWatchlist({ fromAnalyses: true });
  console.log(`新增 ${w.newStocks} / 更新 ${w.updatedStocks} / 略過 ${w.skipped}`);
  for (const d of w.newStockDetails || []) {
    console.log(`   + ${d.market} ${d.ticker}${d.name ? ` (${d.name})` : ''}`);
  }
  for (const e of w.errors) console.log(`   ⚠️ ${e}`);

  console.log('\n=== 完成（未產生日報、未寄送 email）===');
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
