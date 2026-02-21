/**
 * Test Full Flow Pipeline
 *
 * Clears all data from the last 72 hours and re-runs the entire pipeline
 * to test: fetch → transcribe (AssemblyAI + Apify) → analyze → digest → email
 *
 * This does NOT modify any production pipeline code.
 */

import { supabaseAdmin } from '../lib/supabase';
import { formatDateTaipei } from '../lib/digest-cache';
import { fetchFeeds } from '../lib/pipeline/fetch-feeds';
import { transcribeAll } from '../lib/pipeline/transcribe';
import { analyzeAll } from '../lib/pipeline/analyze';
import { sendEmails } from '../lib/pipeline/send-emails';

// --- Custom YouTube fetch with 72h window (production uses 48h) ---
import { consolidateReports, generateQuickDigest, AnalysisResult } from '../lib/openrouter';
import { generateHtmlTemplateWithoutMagicLink } from '../lib/email-generator';
import {
  generateCombinationKey,
  createDigestRecord,
  saveDigestContent,
  markDigestGenerating,
  markDigestNoContent,
  markDigestFailed,
} from '../lib/digest-cache';

function isoDurationToSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0');
}

async function fetchYoutube72h() {
  const results = { sourcesProcessed: 0, videosFound: 0, newEpisodes: 0, pendingJobs: 0, errors: [] as string[] };
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) { results.errors.push('YOUTUBE_API_KEY not configured'); return results; }

  const { data: sources } = await supabaseAdmin.from('sources').select('*').eq('is_active', true).eq('type', 'youtube');
  if (!sources || sources.length === 0) return results;

  const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72h window

  for (const source of sources) {
    if (!source.youtube_channel_id) continue;
    try {
      results.sourcesProcessed++;
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('channelId', source.youtube_channel_id);
      searchUrl.searchParams.set('publishedAfter', threeDaysAgo.toISOString());
      searchUrl.searchParams.set('order', 'date');
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('maxResults', '1');
      searchUrl.searchParams.set('key', apiKey);

      const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(30000) });
      if (!searchRes.ok) { results.errors.push(`YouTube search failed for ${source.id}`); continue; }

      const searchData = await searchRes.json();
      const videoIds = (searchData.items || []).map((item: { id: { videoId: string } }) => item.id.videoId).filter(Boolean);
      if (videoIds.length === 0) continue;

      const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      detailsUrl.searchParams.set('id', videoIds.join(','));
      detailsUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
      detailsUrl.searchParams.set('key', apiKey);

      const detailsRes = await fetch(detailsUrl.toString(), { signal: AbortSignal.timeout(30000) });
      if (!detailsRes.ok) { results.errors.push(`YouTube details failed for ${source.id}`); continue; }

      const detailsData = await detailsRes.json();
      for (const video of detailsData.items || []) {
        if (!video.id || !video.snippet) continue;
        const publishedAt = new Date(video.snippet.publishedAt);
        if (publishedAt < threeDaysAgo) continue;

        const externalId = `yt_${video.id}`;
        results.videosFound++;

        const { data: existing } = await supabaseAdmin.from('episodes').select('id').eq('external_id', externalId).single();
        if (existing) continue;

        const { data: episode, error: episodeError } = await supabaseAdmin.from('episodes').insert({
          source_id: source.id,
          external_id: externalId,
          title: video.snippet.title,
          audio_url: `https://www.youtube.com/watch?v=${video.id}`,
          duration_seconds: isoDurationToSeconds(video.contentDetails?.duration || ''),
          published_at: video.snippet.publishedAt,
        }).select().single();

        if (episodeError) { results.errors.push(`Insert failed: ${episodeError.message}`); continue; }
        results.newEpisodes++;

        if (episode) {
          const { error: jobError } = await supabaseAdmin.from('transcription_jobs').insert({
            episode_id: episode.id, status: 'pending', provider: 'apify',
          });
          if (!jobError) results.pendingJobs++;
        }
      }
    } catch (e) { results.errors.push(`YouTube source ${source.id}: ${e}`); }
  }
  return results;
}

// --- Custom digest generation with 72h cutoff (production uses 24h) ---
async function generateDigest72h() {
  const results = { digestGenerated: false, digestId: null as number | null, episodeCount: 0, errors: [] as string[] };
  const today = new Date();
  const { data: activeSources } = await supabaseAdmin.from('sources').select('id').eq('is_active', true);
  if (!activeSources || activeSources.length === 0) { results.errors.push('No active sources'); return results; }

  const allSourceIds = activeSources.map(s => s.id);
  const emailType = 'daily' as const;

  const digestId = await createDigestRecord(supabaseAdmin, allSourceIds, emailType, today);
  results.digestId = digestId;
  await markDigestGenerating(supabaseAdmin, digestId);

  const cutoffDate = new Date(today.getTime() - 72 * 60 * 60 * 1000); // 72h cutoff

  const { data: analysesRaw, error: analysesError } = await supabaseAdmin
    .from('analyses')
    .select(`*, episodes!inner ( id, title, audio_url, source_id, published_at, sources ( id, name ) )`)
    .in('episodes.source_id', allSourceIds)
    .gte('episodes.published_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false });

  if (analysesError) {
    await markDigestFailed(supabaseAdmin, digestId, analysesError.message);
    results.errors.push(`Fetch analyses failed: ${analysesError.message}`);
    return results;
  }

  // Keep latest episode per source
  const latestBySource = new Map<string, typeof analysesRaw[0]>();
  for (const a of analysesRaw || []) {
    const ep = a.episodes as unknown as { source_id: string; published_at: string };
    if (!allSourceIds.includes(ep?.source_id)) continue;
    const existing = latestBySource.get(ep.source_id);
    if (!existing || new Date(ep.published_at) > new Date((existing.episodes as unknown as { published_at: string }).published_at)) {
      latestBySource.set(ep.source_id, a);
    }
  }
  const analyses = Array.from(latestBySource.values());

  if (analyses.length === 0) {
    await markDigestNoContent(supabaseAdmin, digestId);
    return results;
  }

  results.episodeCount = analyses.length;

  const analysesForConsolidation = analyses.map(analysis => {
    const episode = analysis.episodes as unknown as { id: number; title: string; audio_url: string; sources: { id: string; name: string } };
    let analysisResult: AnalysisResult;

    if (analysis.full_analysis) {
      analysisResult = analysis.full_analysis as AnalysisResult;
    } else {
      const signals = (analysis.stocks_mentioned || []).map((stock: { ticker: string; sentiment: string; context: string }) => ({
        type: stock.sentiment === 'bullish' ? 'bullish' as const : stock.sentiment === 'bearish' ? 'bearish' as const : 'monitor' as const,
        ticker: stock.ticker, reason: stock.context || '', confidence: 'medium' as const,
        action: '無', timeHorizon: 'medium' as const, catalyst: '', priceLevel: '',
      }));
      analysisResult = {
        signals, key_insights: [],
        overall_sentiment: analysis.sentiment === 'bullish' ? 'bullish' : analysis.sentiment === 'bearish' ? 'bearish' : 'neutral',
        summary: analysis.summary || '', episodeHighlights: analysis.key_points || [],
        riskAlerts: [], catalysts: [], podcastName: episode?.sources?.name || 'Unknown',
      };
    }
    return {
      analysis: analysisResult, episodeTitle: episode?.title || 'Unknown',
      podcastName: episode?.sources?.name || 'Unknown', episodeLink: episode?.audio_url, episodeId: episode?.id,
    };
  });

  const consolidatedReport = await consolidateReports(
    analysesForConsolidation.map(a => ({ analysis: a.analysis, episodeTitle: a.episodeTitle, podcastName: a.podcastName, episodeLink: a.episodeLink }))
  );
  const { quickDigest, marketMood } = await generateQuickDigest(consolidatedReport);
  const htmlTemplate = generateHtmlTemplateWithoutMagicLink(consolidatedReport, quickDigest, marketMood);

  await saveDigestContent(supabaseAdmin, digestId, {
    episodeIds: analysesForConsolidation.map(a => a.episodeId).filter((id): id is number => id !== undefined),
    consolidatedReport, quickDigest, marketMood, htmlTemplate,
  });

  results.digestGenerated = true;
  return results;
}

// =============================================
// MAIN
// =============================================
async function main() {
  console.log('========================================');
  console.log('  TEST FULL FLOW - 72h Window');
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log('========================================');

  const today = formatDateTaipei(new Date());
  const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  // --- STEP 0: Clean up DB ---
  console.log('\n=== STEP 0: Cleaning up DB ===');

  // Delete today's email records
  const { data: deletedEmails } = await supabaseAdmin
    .from('digest_emails')
    .delete()
    .gte('sent_at', `${today}T00:00:00`)
    .select('id');
  console.log(`  Deleted ${deletedEmails?.length || 0} email records`);

  // Delete today's digest records
  const { data: deletedDigests } = await supabaseAdmin
    .from('daily_digests')
    .delete()
    .eq('digest_date', today)
    .select('id');
  console.log(`  Deleted ${deletedDigests?.length || 0} digest records`);

  // Delete episodes from last 72h (CASCADE deletes transcription_jobs + analyses)
  const { data: deletedEpisodes } = await supabaseAdmin
    .from('episodes')
    .delete()
    .gte('published_at', cutoff72h)
    .select('id');
  console.log(`  Deleted ${deletedEpisodes?.length || 0} episodes (+ cascaded jobs/analyses)`);

  // --- STEP 1: Fetch podcast feeds ---
  console.log('\n=== STEP 1/6: Fetching podcast feeds ===');
  try {
    const feedsResult = await fetchFeeds();
    console.log(`  Processed: ${feedsResult.processed}, New: ${feedsResult.newEpisodes}, Errors: ${feedsResult.errors.length}`);
    if (feedsResult.errors.length > 0) feedsResult.errors.forEach(e => console.log(`    - ${e}`));
  } catch (e) { console.error(`  Failed: ${e}`); }

  // --- STEP 2: Fetch YouTube (72h window) ---
  console.log('\n=== STEP 2/6: Fetching YouTube videos (72h) ===');
  try {
    const ytResult = await fetchYoutube72h();
    console.log(`  Sources: ${ytResult.sourcesProcessed}, Found: ${ytResult.videosFound}, New: ${ytResult.newEpisodes}, Errors: ${ytResult.errors.length}`);
    if (ytResult.errors.length > 0) ytResult.errors.forEach(e => console.log(`    - ${e}`));
  } catch (e) { console.error(`  Failed: ${e}`); }

  // --- STEP 3: Transcribe ---
  console.log('\n=== STEP 3/6: Transcribing (AssemblyAI + Apify) ===');
  try {
    const transcribeResult = await transcribeAll();
    console.log(`  AssemblyAI - submitted: ${transcribeResult.assemblyai.submitted}, completed: ${transcribeResult.assemblyai.completed}, failed: ${transcribeResult.assemblyai.failed}`);
    console.log(`  Apify - submitted: ${transcribeResult.apify.submitted}, completed: ${transcribeResult.apify.completed}, failed: ${transcribeResult.apify.failed}`);
    console.log(`  Poll cycles: ${transcribeResult.totalPollCycles}`);
    if (transcribeResult.errors.length > 0) transcribeResult.errors.forEach(e => console.log(`    - ${e}`));
  } catch (e) { console.error(`  Failed: ${e}`); }

  // --- STEP 4: Analyze ---
  console.log('\n=== STEP 4/6: Analyzing transcriptions ===');
  try {
    const analyzeResult = await analyzeAll();
    console.log(`  Analyzed: ${analyzeResult.analyzed}, Skipped: ${analyzeResult.skipped}, Errors: ${analyzeResult.errors.length}`);
    if (analyzeResult.errors.length > 0) analyzeResult.errors.forEach(e => console.log(`    - ${e}`));
  } catch (e) { console.error(`  Failed: ${e}`); }

  // --- STEP 5: Generate digest (72h cutoff) ---
  console.log('\n=== STEP 5/6: Generating digest (72h cutoff) ===');
  try {
    const digestResult = await generateDigest72h();
    console.log(`  Generated: ${digestResult.digestGenerated}, Episodes: ${digestResult.episodeCount}, Errors: ${digestResult.errors.length}`);
    if (digestResult.errors.length > 0) digestResult.errors.forEach(e => console.log(`    - ${e}`));
  } catch (e) { console.error(`  Failed: ${e}`); }

  // --- STEP 6: Send emails ---
  console.log('\n=== STEP 6/6: Sending emails ===');
  try {
    const emailsResult = await sendEmails();
    console.log(`  Users: ${emailsResult.usersProcessed}, Sent: ${emailsResult.emailsSent}, Skipped: ${emailsResult.skipped}, Errors: ${emailsResult.errors.length}`);
    if (emailsResult.errors.length > 0) emailsResult.errors.forEach(e => console.log(`    - ${e}`));
  } catch (e) { console.error(`  Failed: ${e}`); }

  console.log('\n========================================');
  console.log('  TEST COMPLETE');
  console.log(`  Finished at: ${new Date().toISOString()}`);
  console.log('========================================');

  process.exit(0);
}

main().catch(e => { console.error('Test crashed:', e); process.exit(1); });
