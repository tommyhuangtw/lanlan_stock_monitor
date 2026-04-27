/**
 * Manual trigger for sector expansion.
 * Reads recent KOL analyses and expands mentioned sector themes
 * into specific stocks added to the watchlist.
 *
 * Usage: npx tsx scripts/expand-sectors-now.ts
 */

import 'dotenv/config';
import { expandSectors } from '../lib/pipeline/expand-sectors';

async function main() {
  console.log('=== Sector Expansion (Manual Trigger) ===\n');
  console.log('Scanning recent KOL analyses for sector themes...\n');

  const result = await expandSectors();

  console.log('\n=== Results ===');
  console.log(`Themes processed: ${result.themesProcessed}`);
  console.log(`Themes skipped (cooldown): ${result.themesSkipped}`);
  console.log(`Stocks added to watchlist: ${result.stocksAdded}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  if (result.stocksAdded > 0) {
    console.log('\nNew stocks have been added to your watchlist.');
    console.log('Run the stock monitor to start tracking them.');
  } else if (result.themesProcessed === 0 && result.themesSkipped === 0) {
    console.log('\nNo bullish sector themes found in recent analyses.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
