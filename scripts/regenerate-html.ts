/**
 * One-time script: Regenerate cached HTML templates in daily_digests
 * from existing consolidated_report data (no API calls).
 * Usage: npx tsx --env-file=.env scripts/regenerate-html.ts
 */

import { createClient } from '@supabase/supabase-js';
import { generateHtmlTemplateWithoutMagicLink } from '../lib/email-generator';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  const { data: digests, error } = await supabase
    .from('daily_digests')
    .select('id, digest_date, consolidated_report, quick_digest, market_mood')
    .eq('status', 'completed');

  if (error) {
    console.error('Failed to fetch digests:', error.message);
    process.exit(1);
  }

  if (!digests || digests.length === 0) {
    console.log('No completed digests found.');
    return;
  }

  console.log(`Found ${digests.length} completed digest(s). Regenerating HTML...`);

  for (const digest of digests) {
    try {
      const newHtml = generateHtmlTemplateWithoutMagicLink(
        digest.consolidated_report,
        digest.quick_digest || [],
        digest.market_mood || ''
      );

      const { error: updateError } = await supabase
        .from('daily_digests')
        .update({ html_template: newHtml })
        .eq('id', digest.id);

      if (updateError) {
        console.error(`  ✗ Digest ${digest.id} (${digest.digest_date}): ${updateError.message}`);
      } else {
        console.log(`  ✓ Digest ${digest.id} (${digest.digest_date}): HTML regenerated`);
      }
    } catch (e) {
      console.error(`  ✗ Digest ${digest.id} (${digest.digest_date}): ${e}`);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
