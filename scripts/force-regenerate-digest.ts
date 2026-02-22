/**
 * Force re-consolidate and regenerate today's digest.
 * Resets digest status to 'pending', then runs generateDigest().
 * Usage: npx tsx -r dotenv/config scripts/force-regenerate-digest.ts
 */
import { supabaseAdmin } from '../lib/supabase';
import { generateDigest } from '../lib/pipeline/generate-digest';
import { formatDateTaipei } from '../lib/digest-cache';

async function main() {
  const today = new Date();
  const dateStr = formatDateTaipei(today);

  console.log(`Resetting digest for ${dateStr} to 'pending'...`);

  const { data, error } = await supabaseAdmin
    .from('daily_digests')
    .update({ status: 'pending' })
    .eq('digest_date', dateStr)
    .eq('status', 'completed')
    .select('id');

  if (error) {
    console.error('Failed to reset digest:', error.message);
    process.exit(1);
  }

  console.log(`Reset ${data?.length || 0} digest(s). Running generateDigest()...`);

  const result = await generateDigest();
  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.digestGenerated) {
    console.log(`Digest #${result.digestId} regenerated with ${result.episodeCount} episodes.`);
  } else {
    console.log('Digest was not generated.', result.errors);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
