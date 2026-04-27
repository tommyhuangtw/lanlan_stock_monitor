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
import { sendLineAlerts } from '../lib/notifications/line';
import { sendEmailAlert } from '../lib/notifications/email-alert';
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

  // Step 0: Backfill historical prices for new stocks (if needed)
  if (shouldBackfill) {
    console.log('\n--- Backfilling historical prices ---');
    const { data: newStocks } = await supabaseAdmin
      .from('watchlist_stocks')
      .select('ticker_normalized')
      .eq('status', 'active')
      .is('last_price_update', null);

    if (newStocks && newStocks.length > 0) {
      console.log(`Backfilling ${newStocks.length} stocks...`);
      for (const stock of newStocks) {
        const stored = await backfillPrices(stock.ticker_normalized, 60);
        console.log(`  ${stock.ticker_normalized}: ${stored} days backfilled`);
      }
    } else {
      console.log('No new stocks to backfill.');
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
