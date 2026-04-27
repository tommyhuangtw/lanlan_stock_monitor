import { fetchFeeds, FetchFeedsResult } from './fetch-feeds';
import { fetchYoutube, FetchYoutubeResult } from './fetch-youtube';
import { transcribeAll, TranscribeResult } from './transcribe';
import { analyzeAll, AnalyzeResult } from './analyze';
import { populateWatchlist, PopulateWatchlistResult } from './populate-watchlist';
import { expandSectors, ExpandSectorsResult } from './expand-sectors';
import { generateDigest, GenerateDigestResult } from './generate-digest';
import { sendEmails, SendEmailsResult } from './send-emails';
import { sendNewStockAlerts } from '../notifications/line';

export interface PipelineResult {
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  steps: {
    fetchFeeds: FetchFeedsResult | null;
    fetchYoutube: FetchYoutubeResult | null;
    transcribe: TranscribeResult | null;
    analyze: AnalyzeResult | null;
    watchlist: PopulateWatchlistResult | null;
    sectorExpansion: ExpandSectorsResult | null;
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
    watchlist: null,
    sectorExpansion: null,
    digest: null,
    emails: null,
  };

  // === STEP 1/8: Fetch podcast feeds ===
  console.log('\n=== STEP 1/8: Fetching podcast feeds ===');
  try {
    steps.fetchFeeds = await fetchFeeds();
    allErrors.push(...steps.fetchFeeds.errors);
    console.log(`  Processed: ${steps.fetchFeeds.processed}, New episodes: ${steps.fetchFeeds.newEpisodes}`);
  } catch (error) {
    const msg = `Fetch feeds failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 2/8: Fetch YouTube videos ===
  console.log('\n=== STEP 2/8: Fetching YouTube videos ===');
  try {
    steps.fetchYoutube = await fetchYoutube();
    allErrors.push(...steps.fetchYoutube.errors);
    console.log(`  Sources: ${steps.fetchYoutube.sourcesProcessed}, New episodes: ${steps.fetchYoutube.newEpisodes}`);
  } catch (error) {
    const msg = `Fetch YouTube failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 3/8: Transcribe all pending episodes ===
  console.log('\n=== STEP 3/8: Transcribing all pending episodes ===');
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

  // === STEP 4/8: Analyze transcriptions ===
  console.log('\n=== STEP 4/8: Analyzing transcriptions ===');
  try {
    steps.analyze = await analyzeAll();
    allErrors.push(...steps.analyze.errors);
    console.log(`  Analyzed: ${steps.analyze.analyzed}, Skipped: ${steps.analyze.skipped}`);
  } catch (error) {
    const msg = `Analysis failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 4.5/8: Populate watchlist (NON-BLOCKING) ===
  console.log('\n=== STEP 4.5/8: Populating watchlist ===');
  try {
    steps.watchlist = await populateWatchlist();
    allErrors.push(...steps.watchlist.errors);
    console.log(`  New: ${steps.watchlist.newStocks}, Updated: ${steps.watchlist.updatedStocks}, Skipped: ${steps.watchlist.skipped}`);
  } catch (error) {
    console.error(`  Watchlist population failed (non-blocking): ${error}`);
    // Non-blocking: don't push to allErrors
  }

  // === STEP 4.6/8: Expand sector themes (NON-BLOCKING) ===
  console.log('\n=== STEP 4.6/8: Expanding sector themes ===');
  try {
    steps.sectorExpansion = await expandSectors();
    allErrors.push(...steps.sectorExpansion.errors);
    console.log(`  Themes: ${steps.sectorExpansion.themesProcessed}, Stocks added: ${steps.sectorExpansion.stocksAdded}, Skipped: ${steps.sectorExpansion.themesSkipped}`);
  } catch (error) {
    console.error(`  Sector expansion failed (non-blocking): ${error}`);
    // Non-blocking: don't push to allErrors
  }

  // === Notify new watchlist stocks via LINE ===
  const allNewStocks = [
    ...(steps.watchlist?.newStockDetails || []),
    ...(steps.sectorExpansion?.newStockDetails || []),
  ];
  if (allNewStocks.length > 0) {
    console.log(`\n  Sending LINE notifications for ${allNewStocks.length} new watchlist stocks...`);
    try {
      await sendNewStockAlerts(allNewStocks);
    } catch (error) {
      console.error(`  New stock LINE notification failed (non-blocking): ${error}`);
    }
  }

  // === STEP 5/8: Generate daily digest ===
  console.log('\n=== STEP 5/8: Generating daily digest ===');
  try {
    steps.digest = await generateDigest();
    allErrors.push(...steps.digest.errors);
    console.log(`  Generated: ${steps.digest.digestGenerated}, Episodes: ${steps.digest.episodeCount}, Skipped: ${steps.digest.skipped}`);
  } catch (error) {
    const msg = `Digest generation failed: ${error}`;
    allErrors.push(msg);
    console.error(`  ${msg}`);
  }

  // === STEP 6/8: Send emails ===
  console.log('\n=== STEP 6/8: Sending emails ===');
  try {
    steps.emails = await sendEmails();
    allErrors.push(...steps.emails.errors);
    if (steps.emails.warnings.length > 0) {
      console.log(`  Warnings (${steps.emails.warnings.length}):`);
      for (const w of steps.emails.warnings) {
        console.log(`    - ${w}`);
      }
    }
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
