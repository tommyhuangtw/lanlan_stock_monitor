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
import { sendTelegramAlerts } from '../lib/notifications/telegram';
// import { sendLineAlerts } from '../lib/notifications/line'; // [DEPRECATED] Migrated to Telegram
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

  // Telegram notifications
  const telegramSent = await sendTelegramAlerts(detectionResults);
  console.log(`Telegram: ${telegramSent} messages sent`);
  if (telegramSent > 0) {
    // Mark alerts as sent via Telegram
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
    if (telegramSent > 0) sentVia.push('telegram');
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
