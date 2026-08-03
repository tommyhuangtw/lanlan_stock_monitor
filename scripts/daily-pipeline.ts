import { runDailyPipeline } from '../lib/pipeline/runner';
import { sendPipelineAlert } from '../lib/notifications/email-alert';

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

    // Report transcription failures even on a "successful" run — a source that
    // fails every episode never reaches result.errors.
    const t = result.steps.transcribe;
    const failedTranscripts = (t?.assemblyai.failed || 0) + (t?.apify.failed || 0);
    // An empty analysis means analyzeTranscript returned nothing usable — the
    // episode is silently missing from the digest, so it needs to be reported.
    const empty = result.steps.digest?.emptyAnalyses || [];

    if (!result.success || failedTranscripts > 0 || empty.length > 0) {
      const problems = [
        !result.success && `${result.errors.length} 個錯誤`,
        failedTranscripts > 0 && `${failedTranscripts} 個逐字稿轉錄失敗`,
        empty.length > 0 && `${empty.length} 集分析全空`,
      ].filter(Boolean).join('、');

      await sendPipelineAlert({
        job: '每日 Pipeline',
        headline: result.success ? `Pipeline 完成，但有 ${problems}` : `Pipeline 有 ${problems}`,
        errors: [
          ...result.errors,
          ...empty.map(e => `分析全空（已排除於日報）：${e}`),
        ],
        includeTranscriptionFailures: failedTranscripts > 0,
      });
    }

    if (!result.success) {
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\nPipeline crashed:', error);
    await sendPipelineAlert({
      job: '每日 Pipeline',
      headline: 'Pipeline 中途崩潰，沒有跑完',
      errors: [String(error)],
    });
    process.exit(1);
  }
}

main();
