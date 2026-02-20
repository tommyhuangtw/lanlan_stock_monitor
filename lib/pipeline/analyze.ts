import { supabaseAdmin } from '../supabase';
import { analyzeTranscript, toLegacyFormat } from '../openrouter';

export interface AnalyzeResult {
  analyzed: number;
  skipped: number;
  errors: string[];
}

export async function analyzeAll(): Promise<AnalyzeResult> {
  const results: AnalyzeResult = {
    analyzed: 0,
    skipped: 0,
    errors: [],
  };

  // Find completed transcriptions without analyses
  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from('transcription_jobs')
    .select(`
      id,
      episode_id,
      transcript,
      episodes (
        id,
        title,
        source_id,
        sources (
          id,
          name
        )
      )
    `)
    .eq('status', 'completed')
    .not('transcript', 'is', null);

  if (jobsError) {
    throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
  }

  if (!jobs || jobs.length === 0) {
    return results;
  }

  // Filter jobs that don't have analyses yet
  for (const job of jobs) {
    // Check if analysis already exists
    const { data: existingAnalysis } = await supabaseAdmin
      .from('analyses')
      .select('id')
      .eq('episode_id', job.episode_id)
      .single();

    if (existingAnalysis) {
      results.skipped++;
      continue;
    }

    if (!job.transcript) {
      results.errors.push(`Job ${job.id} has no transcript`);
      continue;
    }

    try {
      // Get episode and source info
      const episode = job.episodes as unknown as {
        title: string;
        source_id: string;
        sources: { id: string; name: string }
      };
      const episodeTitle = episode?.title || 'Unknown';
      const podcastName = episode?.sources?.name || 'Unknown';

      // Analyze with OpenRouter
      const fullAnalysis = await analyzeTranscript(job.transcript, episodeTitle, podcastName);

      // Convert to legacy format for database storage
      const legacyAnalysis = toLegacyFormat(fullAnalysis);

      // Insert analysis
      const { error: insertError } = await supabaseAdmin
        .from('analyses')
        .insert({
          episode_id: job.episode_id,
          summary: legacyAnalysis.summary,
          key_points: legacyAnalysis.key_points,
          stocks_mentioned: legacyAnalysis.stocks_mentioned,
          sentiment: legacyAnalysis.sentiment,
          full_analysis: fullAnalysis,
        });

      if (insertError) {
        results.errors.push(`Failed to insert analysis for episode ${job.episode_id}: ${insertError.message}`);
      } else {
        results.analyzed++;
      }
    } catch (analysisError) {
      results.errors.push(`Failed to analyze episode ${job.episode_id}: ${analysisError}`);
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
