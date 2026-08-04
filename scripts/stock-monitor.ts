/**
 * Stock Monitor Script
 *
 * Fetches latest prices for all watchlist stocks, computes technical indicators,
 * detects entry points, and sends notifications.
 *
 * Run: npx tsx scripts/stock-monitor.ts [--market US|TW] [--backfill]
 */

import { fetchAndStorePrices, backfillPrices, fetchSectorProfile } from '../lib/stock-data';
import { classifyTechStocks } from '../lib/openrouter';
import { detectEntryPoints, saveAlerts } from '../lib/entry-point-detector';
import { sendLineAlerts } from '../lib/notifications/line';
import type { CleanupEntry } from '../lib/notifications/line';
import { sendEmailAlert, sendPipelineAlert } from '../lib/notifications/email-alert';
import { generateAndSaveAliases } from '../lib/generate-aliases';
import { supabaseAdmin } from '../lib/supabase';
import { log } from '../lib/logger';

async function main() {
  const args = process.argv.slice(2);
  const marketFilter = args.includes('--market')
    ? (args[args.indexOf('--market') + 1] as 'US' | 'TW')
    : undefined;
  const shouldBackfill = args.includes('--backfill');

  console.log('=== Stock Monitor ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Market filter: ${marketFilter || 'all'}`);
  console.log(`Backfill mode: ${shouldBackfill}`);

  // Step 0: Auto-backfill historical prices for new stocks (no price data yet)
  {
    console.log('\n--- Checking for new stocks to backfill ---');
    const { data: newStocks } = await supabaseAdmin
      .from('watchlist_stocks')
      .select('ticker_normalized')
      .eq('status', 'active')
      .is('last_price_update', null);

    if (newStocks && newStocks.length > 0) {
      console.log(`Backfilling ${newStocks.length} new stocks (300 days for SMA200)...`);
      const BACKFILL_BATCH = 5;
      for (let i = 0; i < newStocks.length; i += BACKFILL_BATCH) {
        const batch = newStocks.slice(i, i + BACKFILL_BATCH);
        const results = await Promise.all(
          batch.map(stock => backfillPrices(stock.ticker_normalized, 300))
        );
        batch.forEach((stock, idx) => {
          console.log(`  ${stock.ticker_normalized}: ${results[idx]} days backfilled`);
        });
      }
    } else {
      console.log('No new stocks to backfill.');
    }
  }

  // Step 0b: Auto-generate aliases for stocks missing them
  {
    console.log('\n--- Checking for stocks without aliases ---');
    const { data: noAliasStocks } = await supabaseAdmin
      .from('watchlist_stocks')
      .select('id, ticker_normalized, name')
      .eq('status', 'active')
      .or('aliases.is.null,aliases.eq.{}');

    if (noAliasStocks && noAliasStocks.length > 0) {
      console.log(`Generating aliases for ${noAliasStocks.length} stocks...`);
      const ALIAS_BATCH = 5;
      for (let i = 0; i < noAliasStocks.length; i += ALIAS_BATCH) {
        const batch = noAliasStocks.slice(i, i + ALIAS_BATCH);
        const results = await Promise.all(
          batch.map(stock => generateAndSaveAliases(stock.id, stock.ticker_normalized, stock.name))
        );
        batch.forEach((stock, idx) => {
          console.log(`  ${stock.ticker_normalized}: [${results[idx].join(', ')}]`);
        });
      }
    } else {
      console.log('All stocks have aliases.');
    }
  }

  // Step 0c: Look up sectors for stocks that don't have one yet
  {
    console.log('\n--- Checking for stocks without sector ---');
    const { data: noSector } = await supabaseAdmin
      .from('watchlist_stocks')
      .select('id, ticker, ticker_normalized, name')
      .eq('status', 'active')
      .is('sector_checked_at', null);

    if (noSector && noSector.length > 0) {
      console.log(`Fetching sector for ${noSector.length} stocks...`);
      const SECTOR_BATCH = 5;
      for (let i = 0; i < noSector.length; i += SECTOR_BATCH) {
        const batch = noSector.slice(i, i + SECTOR_BATCH);
        const profiles = await Promise.all(
          batch.map(s => fetchSectorProfile(s.ticker_normalized))
        );
        // Yahoo supplies the facts; the model decides whether the business is
        // tech. GICS alone puts Comcast beside Google and leaves ETFs blank.
        const verdicts = await classifyTechStocks(
          batch.map((s, idx) => ({
            ticker: s.ticker,
            name: s.name,
            sector: profiles[idx].sector,
            industry: profiles[idx].industry,
            summary: profiles[idx].summary,
          }))
        );
        // Only cache a verdict the model actually produced. Caching a failed
        // call would set sector_checked_at and freeze the fallback "keep"
        // forever, turning one transient error into permanent bad data.
        await Promise.all(batch.map((s, idx) =>
          verdicts[idx].ok
            ? supabaseAdmin
                .from('watchlist_stocks')
                .update({
                  sector: profiles[idx].sector,
                  industry: profiles[idx].industry,
                  is_tech: verdicts[idx].tech,
                  tech_reason: verdicts[idx].reason,
                  sector_checked_at: new Date().toISOString(),
                })
                .eq('id', s.id)
            : Promise.resolve()
        ));
        batch.forEach((s, idx) => {
          console.log(`  ${s.ticker_normalized}: ${verdicts[idx].tech ? '科技' : '非科技'} — ${verdicts[idx].reason}`);
        });
      }
    } else {
      console.log('All stocks have a sector.');
    }
  }

  // Step 1: Fetch latest prices
  console.log('\n--- Fetching latest prices ---');
  const priceResults = await fetchAndStorePrices(marketFilter);
  console.log(`Fetched: ${priceResults.fetched}, Stored: ${priceResults.stored}, Failed: ${priceResults.failed}`);
  if (priceResults.errors.length > 0) {
    console.log(`Errors: ${priceResults.errors.join('; ')}`);
  }

  // Step 1b: Auto-cleanup stale/invalid stocks
  {
    console.log('\n--- Auto-cleanup watchlist ---');
    const cleanupEntries: CleanupEntry[] = [];

    // Rule 1: Archive stocks with 7+ consecutive fetch failures
    const { data: failedStocks } = await supabaseAdmin
      .from('watchlist_stocks')
      .select('id, ticker_normalized, consecutive_fetch_failures')
      .eq('status', 'active')
      .gte('consecutive_fetch_failures', 7);

    if (failedStocks && failedStocks.length > 0) {
      for (const stock of failedStocks) {
        await supabaseAdmin
          .from('watchlist_stocks')
          .update({ status: 'archived', archived_reason: 'fetch_failed_7x' })
          .eq('id', stock.id);
        cleanupEntries.push({
          ticker: stock.ticker_normalized,
          reason: `連續 ${stock.consecutive_fetch_failures} 次無法取得價格`,
        });
      }
      console.log(`  Archived ${failedStocks.length} stocks (fetch failures)`);
    }

    // Rule 1b: Archive anything outside tech. Runs before the market caps so
    // the remaining slots go to the most-recently-mentioned tech names rather
    // than being spent on banks and REITs.
    {
      // Reads the cached verdict — never re-classifies, so a stock can't flip
      // between tech and non-tech across runs.
      const { data: nonTech } = await supabaseAdmin
        .from('watchlist_stocks')
        .select('id, ticker_normalized, tech_reason')
        .eq('status', 'active')
        .eq('is_tech', false);

      for (const stock of nonTech || []) {
        await supabaseAdmin
          .from('watchlist_stocks')
          .update({ status: 'archived', archived_reason: 'not_tech' })
          .eq('id', stock.id);
        cleanupEntries.push({
          ticker: stock.ticker_normalized,
          reason: `非科技股（${stock.tech_reason || '不符合追蹤範圍'}）`,
        });
      }
      if (nonTech?.length) console.log(`  Archived ${nonTech.length} non-tech stocks`);
    }

    // Rule 2 & 3: Enforce market caps (TW <= 40, US <= 60)
    const MARKET_CAPS: Array<{ market: 'TW' | 'US'; limit: number; label: string }> = [
      { market: 'TW', limit: 40, label: '台股' },
      { market: 'US', limit: 50, label: '美股' },
    ];

    for (const { market, limit, label } of MARKET_CAPS) {
      const { count } = await supabaseAdmin
        .from('watchlist_stocks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('market', market);

      const activeCount = count || 0;
      if (activeCount > limit) {
        const excess = activeCount - limit;
        // Get the least-recently-mentioned stocks to archive
        const { data: staleStocks } = await supabaseAdmin
          .from('watchlist_stocks')
          .select('id, ticker_normalized, last_mentioned_at')
          .eq('status', 'active')
          .eq('market', market)
          .order('last_mentioned_at', { ascending: true, nullsFirst: true })
          .limit(excess);

        if (staleStocks && staleStocks.length > 0) {
          for (const stock of staleStocks) {
            await supabaseAdmin
              .from('watchlist_stocks')
              .update({ status: 'archived', archived_reason: `over_${market.toLowerCase()}_limit` })
              .eq('id', stock.id);
            const mentionDate = stock.last_mentioned_at
              ? new Date(stock.last_mentioned_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
              : '從未';
            cleanupEntries.push({
              ticker: stock.ticker_normalized,
              reason: `${label}超過 ${limit} 檔上限，最後提及 ${mentionDate}`,
            });
          }
          console.log(`  Archived ${staleStocks.length} ${market} stocks (over ${limit} limit)`);
        }
      }
    }

    // Log only — not pushed to LINE. Cleanup is routine housekeeping now that
    // the tech filter runs daily, and it isn't something the group needs to
    // see. The current watchlist is always available via /清單.
    if (cleanupEntries.length > 0) {
      console.log(`  Archived ${cleanupEntries.length} stocks:`);
      for (const e of cleanupEntries) console.log(`    - ${e.ticker}: ${e.reason}`);
    } else {
      console.log('  No stocks to clean up.');
    }
  }

  // Step 2: Detect entry points
  console.log('\n--- Detecting entry points ---');
  const detectionResults = await detectEntryPoints(marketFilter);
  console.log(`Stocks with signals: ${detectionResults.length}`);

  for (const result of detectionResults) {
    console.log(`  ${result.ticker} (${result.market}): ${result.signals.length} signal(s)`);
    for (const signal of result.signals) {
      console.log(`    - ${signal.alertType}: ${signal.triggerReason}`);
    }
  }

  if (detectionResults.length === 0) {
    console.log('\nNo entry signals detected. Done.');
    return;
  }

  // Step 3: Save alerts to database
  console.log('\n--- Saving alerts ---');
  const savedCount = await saveAlerts(detectionResults);
  console.log(`Saved ${savedCount} alerts to database`);

  // Step 4: Send notifications
  console.log('\n--- Sending notifications ---');

  // Update alert status
  const alertIds: number[] = [];

  // LINE notifications
  const lineSent = await sendLineAlerts(detectionResults);
  console.log(`LINE: ${lineSent} messages sent`);
  if (lineSent > 0) {
    // Mark alerts as sent via LINE
    for (const result of detectionResults) {
      const { data: alerts } = await supabaseAdmin
        .from('stock_alerts')
        .select('id')
        .eq('ticker', result.ticker)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(result.signals.length);

      if (alerts) {
        alertIds.push(...alerts.map(a => a.id));
      }
    }
  }

  // Email notification (one consolidated email)
  const emailSent = await sendEmailAlert(detectionResults);
  console.log(`Email: ${emailSent ? 'sent' : 'skipped'}`);

  // Update sent status
  if (alertIds.length > 0) {
    const sentVia = [];
    if (lineSent > 0) sentVia.push('line');
    if (emailSent) sentVia.push('email');

    await supabaseAdmin
      .from('stock_alerts')
      .update({
        status: 'sent',
        sent_via: sentVia,
        sent_at: new Date().toISOString(),
      })
      .in('id', alertIds);
  }

  console.log('\n=== Stock Monitor Complete ===');
}

main().catch(async error => {
  log('error', `Stock monitor failed: ${error}`);
  console.error('Fatal error:', error);
  await sendPipelineAlert({
    job: '股價監控',
    headline: '股價監控中途崩潰，這輪提醒沒有送出',
    errors: [String(error)],
  });
  process.exit(1);
});
