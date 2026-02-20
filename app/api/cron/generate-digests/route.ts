import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { consolidateReports, generateQuickDigest, AnalysisResult } from '@/lib/openrouter';
import { generateHtmlTemplateWithoutMagicLink } from '@/lib/email-generator';
import {
  generateCombinationKey,
  createDigestRecord,
  saveDigestContent,
  markDigestFailed,
  markDigestNoContent,
  markDigestGenerating,
  formatDateTaipei,
} from '@/lib/digest-cache';

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  const vercelCron = request.headers.get('x-vercel-cron');
  return vercelCron === '1';
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    combinationsProcessed: 0,
    digestsGenerated: 0,
    noContentCombinations: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const today = new Date();
    const dateStr = formatDateTaipei(today);

    // Get all active sources - simplified: one combination for all users
    const { data: activeSources, error: sourcesError } = await supabaseAdmin
      .from('sources')
      .select('id')
      .eq('is_active', true);

    if (sourcesError || !activeSources || activeSources.length === 0) {
      return NextResponse.json({
        message: 'No active sources to process',
        error: sourcesError?.message,
        ...results,
      });
    }

    const allSourceIds = activeSources.map(s => s.id);
    const combinationKey = generateCombinationKey(allSourceIds);

    // Only generate daily digest (free users on Mondays get the same daily digest)
    const emailType = 'daily' as const;

    results.combinationsProcessed = 1;

    try {
      // Check if already generated today
      const { data: existingDigest } = await supabaseAdmin
        .from('daily_digests')
        .select('id, status')
        .eq('digest_date', dateStr)
        .eq('source_combination_key', combinationKey)
        .eq('email_type', emailType)
        .single();

      if (existingDigest?.status === 'completed') {
        results.skipped++;
      } else {
        // Create or get digest record
        const digestId = existingDigest?.id || await createDigestRecord(
          supabaseAdmin,
          allSourceIds,
          emailType,
          today
        );

        // Mark as generating
        await markDigestGenerating(supabaseAdmin, digestId);

        // Only include episodes published within the last 24 hours (use 72 for testing)
        const cutoffHours = 24;
        const cutoffDate = new Date(today.getTime() - cutoffHours * 60 * 60 * 1000);

        // Get analyses for episodes published in the last 24 hours
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
        } else {
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
          const analyses = Array.from(latestBySource.values());

          if (analyses.length === 0) {
            await markDigestNoContent(supabaseAdmin, digestId);
            results.noContentCombinations++;
          } else {
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

            // Consolidate reports (calls OpenRouter)
            const consolidatedReport = await consolidateReports(
              analysesForConsolidation.map(a => ({
                analysis: a.analysis,
                episodeTitle: a.episodeTitle,
                podcastName: a.podcastName,
                episodeLink: a.episodeLink,
              }))
            );

            // Generate quick digest (calls OpenRouter)
            const { quickDigest, marketMood } = await generateQuickDigest(consolidatedReport);

            // Generate HTML template (no API call)
            const htmlTemplate = generateHtmlTemplateWithoutMagicLink(
              consolidatedReport,
              quickDigest,
              marketMood
            );

            // Save to database
            await saveDigestContent(supabaseAdmin, digestId, {
              episodeIds: analysesForConsolidation.map(a => a.episodeId).filter((id): id is number => id !== undefined),
              consolidatedReport,
              quickDigest,
              marketMood,
              htmlTemplate,
            });

            results.digestsGenerated++;
          }
        }
      }
    } catch (error) {
      results.errors.push(`Failed to generate daily digest: ${error}`);
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      combinationKey,
      ...results,
    });

  } catch (error) {
    console.error('Generate digests error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
