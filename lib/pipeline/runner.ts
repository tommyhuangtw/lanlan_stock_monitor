import { fetchFeeds, FetchFeedsResult } from './fetch-feeds';
import { fetchYoutube, FetchYoutubeResult } from './fetch-youtube';
import { transcribeAll, TranscribeResult } from './transcribe';
import { analyzeAll, AnalyzeResult } from './analyze';
import { generateDigest, GenerateDigestResult } from './generate-digest';
import { sendEmails, SendEmailsResult } from './send-emails';

export interface PipelineResult {
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  steps: {
    fetchFeeds: FetchFeedsResult | null;
    fetchYoutube: FetchYoutubeResult | null;
    transcribe: TranscribeResult | null;
    analyze: AnalyzeResult | null;
    digest: GenerateDigestResult | null;
    emails: SendEmailsResult | null;
  };
  success: boolean;
  errors: string[];
}

export async function runDailyPipeline(): Promise<PipelineResult> {
  const startedAt = new Date();
  const allErrors: string[] = [];
  const steps: PipelineResult['steps'] = {
    fetchFeeds: null,
    fetchYoutube: null,
    transcribe: null,
    analyze: null,
    digest: null,
    emails: null,
  };

  // === STEP 1/6: Fetch podcast feeds ===
  console.log('\n=== STEP 1/6: Fetching podcast feeds ===');
  try {
    steps.fetchFeeds = await fetchFeeds();
    allErrors.push(...steps.fetchFeeds.errors);
    console.log(`  Processed: ${steps.fetchFeeds.processed}, New episodes: ${steps.fetchFeeds.newEpisodes}`);
  } catch (error) {
    const msg = `Fetch feeds failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 2/6: Fetch YouTube videos ===
  console.log('\n=== STEP 2/6: Fetching YouTube videos ===');
  try {
    steps.fetchYoutube = await fetchYoutube();
    allErrors.push(...steps.fetchYoutube.errors);
    console.log(`  Sources: ${steps.fetchYoutube.sourcesProcessed}, New episodes: ${steps.fetchYoutube.newEpisodes}`);
  } catch (error) {
    const msg = `Fetch YouTube failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 3/6: Transcribe all pending episodes ===
  console.log('\n=== STEP 3/6: Transcribing all pending episodes ===');
  try {
    steps.transcribe = await transcribeAll();
    allErrors.push(...steps.transcribe.errors);
    console.log(`  AssemblyAI - submitted: ${steps.transcribe.assemblyai.submitted}, completed: ${steps.transcribe.assemblyai.completed}, failed: ${steps.transcribe.assemblyai.failed}`);
    console.log(`  Apify - submitted: ${steps.transcribe.apify.submitted}, completed: ${steps.transcribe.apify.completed}, failed: ${steps.transcribe.apify.failed}`);
    console.log(`  Total poll cycles: ${steps.transcribe.totalPollCycles}`);
  } catch (error) {
    const msg = `Transcription failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 4/6: Analyze transcriptions ===
  console.log('\n=== STEP 4/6: Analyzing transcriptions ===');
  try {
    steps.analyze = await analyzeAll();
    allErrors.push(...steps.analyze.errors);
    console.log(`  Analyzed: ${steps.analyze.analyzed}, Skipped: ${steps.analyze.skipped}`);
  } catch (error) {
    const msg = `Analysis failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 5/6: Generate daily digest ===
  console.log('\n=== STEP 5/6: Generating daily digest ===');
  try {
    steps.digest = await generateDigest();
    allErrors.push(...steps.digest.errors);
    console.log(`  Generated: ${steps.digest.digestGenerated}, Episodes: ${steps.digest.episodeCount}, Skipped: ${steps.digest.skipped}`);
  } catch (error) {
    const msg = `Digest generation failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 6/6: Send emails ===
  console.log('\n=== STEP 6/6: Sending emails ===');
  try {
    steps.emails = await sendEmails();
    allErrors.push(...steps.emails.errors);
    console.log(`  Users: ${steps.emails.usersProcessed}, Sent: ${steps.emails.emailsSent}, Skipped: ${steps.emails.skipped}`);
  } catch (error) {
    const msg = `Email sending failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  const completedAt = new Date();
  const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000 * 10) / 10;

  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMinutes,
    steps,
    success: allErrors.length === 0,
    errors: allErrors,
  };
}
