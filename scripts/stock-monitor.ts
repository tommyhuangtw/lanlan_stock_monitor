/**
 * Stock Monitor Script
 *
 * Fetches latest prices for all watchlist stocks, computes technical indicators,
 * detects entry points, and sends notifications.
 *
 * Run: npx tsx scripts/stock-monitor.ts [--market US|TW] [--backfill]
 */

import { fetchAndStorePrices, backfillPrices } from '../lib/stock-data';
import { detectEntryPoints, saveAlerts } from '../lib/entry-point-detector';
import { sendLineAlerts, sendCleanupNotification } from '../lib/notifications/line';
import type { CleanupEntry } from '../lib/notifications/line';
import { sendEmailAlert } from '../lib/notifications/email-alert';
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

    // Rule 2 & 3: Enforce market caps (TW <= 40, US <= 60)
    const MARKET_CAPS: Array<{ market: 'TW' | 'US'; limit: number; label: string }> = [
      { market: 'TW', limit: 40, label: '台股' },
      { market: 'US', limit: 100, label: '美股' },
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

    // Send cleanup notification
    if (cleanupEntries.length > 0) {
      const { count: usActive } = await supabaseAdmin
        .from('watchlist_stocks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('market', 'US');
      const { count: twActive } = await supabaseAdmin
        .from('watchlist_stocks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('market', 'TW');

      await sendCleanupNotification(cleanupEntries, usActive || 0, twActive || 0);
      console.log(`  Sent cleanup notification (${cleanupEntries.length} stocks archived)`);
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

main().catch(error => {
  log('error', `Stock monitor failed: ${error}`);
  console.error('Fatal error:', error);
  process.exit(1);
});
