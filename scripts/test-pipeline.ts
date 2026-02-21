import { supabaseAdmin } from '../lib/supabase';
import { formatDateTaipei } from '../lib/digest-cache';
import { runDailyPipeline } from '../lib/pipeline/runner';

async function main() {
  console.log('========================================');
  console.log('  TEST Pipeline - Force Full Run');
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log('========================================');

  const today = formatDateTaipei(new Date());
  console.log(`\n  Today (Taipei): ${today}`);

  // Step 1: Clear today's digest records to force regeneration
  console.log('\n--- Clearing today\'s digest records ---');
  const { data: digests, error: digestError } = await supabaseAdmin
    .from('daily_digests')
    .delete()
    .eq('digest_date', today)
    .select('id');

  if (digestError) {
    console.error('  Failed to clear digests:', digestError.message);
  } else {
    console.log(`  Deleted ${digests?.length || 0} digest records`);
  }

  // Step 2: Clear today's email send records to allow re-sending
  console.log('\n--- Clearing today\'s email send records ---');
  const { data: emails, error: emailError } = await supabaseAdmin
    .from('digest_emails')
    .delete()
    .gte('sent_at', `${today}T00:00:00`)
    .lt('sent_at', `${today}T23:59:59`)
    .select('id');

  if (emailError) {
    console.error('  Failed to clear email records:', emailError.message);
  } else {
    console.log(`  Deleted ${emails?.length || 0} email send records`);
  }

  // Step 3: Run the full pipeline
  console.log('\n--- Running full pipeline ---');
  try {
    const result = await runDailyPipeline();

    console.log('\n========================================');
    console.log('  TEST PIPELINE COMPLETE');
    console.log('========================================');
    console.log(`  Duration: ${result.durationMinutes} minutes`);
    console.log(`  Success: ${result.success}`);

    if (result.errors.length > 0) {
      console.log(`  Errors (${result.errors.length}):`);
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }

    console.log('\n  Full result:');
    console.log(JSON.stringify(result, null, 2));

    if (!result.success) {
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\nPipeline crashed:', error);
    process.exit(1);
  }
}

main();
