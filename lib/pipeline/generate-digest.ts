import { supabaseAdmin } from '../supabase';
import { consolidateReports, generateQuickDigest, AnalysisResult, classifyEpisodeRelevance } from '../openrouter';
import { generateHtmlTemplateWithoutMagicLink } from '../email-generator';
import {
  generateCombinationKey,
  createDigestRecord,
  saveDigestContent,
  markDigestFailed,
  markDigestNoContent,
  markDigestGenerating,
  formatDateTaipei,
} from '../digest-cache';
import { generateMarketBrief, MarketBrief } from '../stock-research';

export interface GenerateDigestResult {
  digestGenerated: boolean;
  digestId: number | null;
  episodeCount: number;
  skipped: boolean;
  errors: string[];
}

export async function generateDigest(): Promise<GenerateDigestResult> {
  const results: GenerateDigestResult = {
    digestGenerated: false,
    digestId: null,
    episodeCount: 0,
    skipped: false,
    errors: [],
  };

  const today = new Date();
  const dateStr = formatDateTaipei(today);

  // Get all active sources
  const { data: activeSources, error: sourcesError } = await supabaseAdmin
    .from('sources')
    .select('id')
    .eq('is_active', true);

  if (sourcesError || !activeSources || activeSources.length === 0) {
    results.errors.push(`No active sources: ${sourcesError?.message || 'none found'}`);
    return results;
  }

  const allSourceIds = activeSources.map(s => s.id);
  const combinationKey = generateCombinationKey(allSourceIds);
  const emailType = 'daily' as const;

  // Check if already generated today
  const { data: existingDigest } = await supabaseAdmin
    .from('daily_digests')
    .select('id, status')
    .eq('digest_date', dateStr)
    .eq('source_combination_key', combinationKey)
    .eq('email_type', emailType)
    .single();

  if (existingDigest?.status === 'completed') {
    results.skipped = true;
    results.digestId = existingDigest.id;
    return results;
  }

  // Create or get digest record
  const digestId = existingDigest?.id || await createDigestRecord(
    supabaseAdmin,
    allSourceIds,
    emailType,
    today
  );

  results.digestId = digestId;

  // Mark as generating
  await markDigestGenerating(supabaseAdmin, digestId);

  // Generate daily market brief (always runs, even with 0 episodes)
  let marketBriefData: MarketBrief = { content: '', citations: [] };
  try {
    marketBriefData = await generateMarketBrief();
  } catch (error) {
    console.error('[generateDigest] Market brief failed, continuing without:', error);
  }

  // Only include episodes published within the last 24 hours
  const cutoffHours = 24;
  const cutoffDate = new Date(today.getTime() - cutoffHours * 60 * 60 * 1000);

  // Get analyses for recent episodes
  const { data: analysesRaw, error: analysesError } = await supabaseAdmin
    .from('analyses')
    .select(`
      *,
      episodes!inner (
        id,
        title,
        audio_url,
        source_id,
        published_at,
        sources (
          id,
          name
        )
      )
    `)
    .in('episodes.source_id', allSourceIds)
    .gte('episodes.published_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false });

  if (analysesError) {
    await markDigestFailed(supabaseAdmin, digestId, analysesError.message);
    results.errors.push(`Failed to fetch analyses: ${analysesError.message}`);
    return results;
  }

  // Filter to active sources, then keep only the latest episode per source
  const analysesAll = (analysesRaw || []).filter(a => {
    const episode = a.episodes as unknown as { source_id: string };
    return allSourceIds.includes(episode?.source_id);
  });

  const latestBySource = new Map<string, typeof analysesAll[0]>();
  for (const a of analysesAll) {
    const ep = a.episodes as unknown as { source_id: string; published_at: string };
    const existing = latestBySource.get(ep.source_id);
    if (!existing) {
      latestBySource.set(ep.source_id, a);
    } else {
      const existingEp = existing.episodes as unknown as { published_at: string };
      if (new Date(ep.published_at) > new Date(existingEp.published_at)) {
        latestBySource.set(ep.source_id, a);
      }
    }
  }
  const candidates = Array.from(latestBySource.values());

  // Drop episodes that are neither about individual stocks nor about the
  // market — investing tutorials, sponsor reads, general personal finance.
  // Deliberately done here rather than before analyze(): the analysis itself
  // still feeds @KOL lookups and the watchlist, so only the digest skips them.
  const verdicts = await classifyEpisodeRelevance(
    candidates.map(a => {
      const ep = a.episodes as unknown as { id: number; title: string; sources?: { name: string } };
      const fa = (a.full_analysis || {}) as {
        signals?: Array<{ ticker: string }>;
        key_insights?: string[];
        sectorThemes?: string[];
      };
      return {
        episodeId: ep.id,
        title: ep.title || '',
        podcastName: ep.sources?.name || 'Unknown',
        insights: fa.key_insights || [],
        sectorThemes: fa.sectorThemes || [],
        tickers: (fa.signals || []).map(s => s.ticker).filter(Boolean),
      };
    }),
  );
  const dropped = new Map(verdicts.filter(v => !v.keep).map(v => [v.episodeId, v]));

  const analyses = candidates.filter(a => {
    const ep = a.episodes as unknown as { id: number; title: string };
    const verdict = dropped.get(ep.id);
    if (verdict) {
      console.log(`  [digest] 略過「${ep.title}」— ${verdict.category}：${verdict.reason}`);
    }
    return !verdict;
  });

  const hasEpisodes = analyses.length > 0;
  const hasMarketBrief = marketBriefData.content.length > 0;

  // If no episodes AND no market brief, mark as no content
  if (!hasEpisodes && !hasMarketBrief) {
    await markDigestNoContent(supabaseAdmin, digestId);
    return results;
  }

  results.episodeCount = analyses.length;

  // Build consolidated report (only if episodes exist)
  let consolidatedReport: import('../openrouter').ConsolidatedReport;
  let quickDigest: string[] = [];
  let marketMood = '';
  const episodeIds: number[] = [];

  if (hasEpisodes) {
    // Transform analyses for consolidation
    const analysesForConsolidation = analyses.map(analysis => {
      const episode = analysis.episodes as unknown as {
        id: number;
        title: string;
        audio_url: string;
        sources: { id: string; name: string };
      };

      let analysisResult: AnalysisResult;

      if (analysis.full_analysis) {
        analysisResult = analysis.full_analysis as AnalysisResult;
      } else {
        const signals = (analysis.stocks_mentioned || []).map((stock: { ticker: string; sentiment: string; context: string }) => ({
          type: stock.sentiment === 'bullish' ? 'bullish' as const :
                stock.sentiment === 'bearish' ? 'bearish' as const : 'monitor' as const,
          ticker: stock.ticker,
          reason: stock.context || '',
          confidence: 'medium' as const,
          action: '無',
          timeHorizon: 'medium' as const,
          catalyst: '',
          priceLevel: '',
        }));

        analysisResult = {
          signals,
          key_insights: [],
          overall_sentiment: analysis.sentiment === 'bullish' ? 'bullish' :
                            analysis.sentiment === 'bearish' ? 'bearish' : 'neutral',
          summary: analysis.summary || '',
          episodeHighlights: analysis.key_points || [],
          riskAlerts: [],
          catalysts: [],
          podcastName: episode?.sources?.name || 'Unknown',
        };
      }

      return {
        analysis: analysisResult,
        episodeTitle: episode?.title || 'Unknown',
        podcastName: episode?.sources?.name || 'Unknown',
        episodeLink: episode?.audio_url,
        episodeId: episode?.id,
      };
    });

    episodeIds.push(
      ...analysesForConsolidation.map(a => a.episodeId).filter((id): id is number => id !== undefined)
    );

    // Consolidate reports (calls OpenRouter)
    consolidatedReport = await consolidateReports(
      analysesForConsolidation.map(a => ({
        analysis: a.analysis,
        episodeTitle: a.episodeTitle,
        podcastName: a.podcastName,
        episodeLink: a.episodeLink,
      }))
    );

    if (consolidatedReport.episodeSummaries.length === 0) {
      console.warn(`[generateDigest] ⚠️ Consolidation returned 0 episodeSummaries despite ${analyses.length} input analyses`);
    }

    // Generate quick digest (calls OpenRouter)
    const quickDigestResult = await generateQuickDigest(consolidatedReport);
    quickDigest = quickDigestResult.quickDigest;
    marketMood = quickDigestResult.marketMood;

  } else {
    // Market-brief-only digest (no episodes)
    consolidatedReport = {
      date: dateStr,
      totalSources: 0,
      bullishSignals: [],
      bearishSignals: [],
      monitorSignals: [],
      keyInsights: [],
      riskAlerts: [],
      upcomingCatalysts: [],
      episodeSummaries: [],
    };
  }

  // Generate HTML template
  const htmlTemplate = generateHtmlTemplateWithoutMagicLink(
    consolidatedReport,
    quickDigest,
    marketMood,
    marketBriefData
  );

  // Save to database
  await saveDigestContent(supabaseAdmin, digestId, {
    episodeIds,
    consolidatedReport,
    quickDigest,
    marketMood,
    htmlTemplate,
    marketBrief: marketBriefData.content,
  });

  results.digestGenerated = true;
  return results;
}
