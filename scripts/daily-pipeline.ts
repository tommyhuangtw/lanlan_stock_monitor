import { runDailyPipeline } from '../lib/pipeline/runner';

async function main() {
  console.log('========================================');
  console.log('  Daily Pipeline - Lanlan Stock Monitor');
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log('========================================');

  try {
    const result = await runDailyPipeline();

    console.log('\n========================================');
    console.log('  PIPELINE COMPLETE');
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
