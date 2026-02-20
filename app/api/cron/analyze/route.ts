import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { analyzeTranscript, toLegacyFormat } from '@/lib/openrouter';

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
    analyzed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
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
      return NextResponse.json({ message: 'No completed transcriptions found', ...results });
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

        // Analyze with OpenRouter using the full n8n-style prompt
        const fullAnalysis = await analyzeTranscript(job.transcript, episodeTitle, podcastName);

        // Convert to legacy format for database storage (for now)
        // In the future, we can store the full analysis
        const legacyAnalysis = toLegacyFormat(fullAnalysis);

        // Insert analysis - store both legacy and full format
        const { error: insertError } = await supabaseAdmin
          .from('analyses')
          .insert({
            episode_id: job.episode_id,
            summary: legacyAnalysis.summary,
            key_points: legacyAnalysis.key_points,
            stocks_mentioned: legacyAnalysis.stocks_mentioned,
            sentiment: legacyAnalysis.sentiment,
            full_analysis: fullAnalysis, // Store complete analysis for consolidation
          });

        if (insertError) {
          results.errors.push(`Failed to insert analysis for episode ${job.episode_id}: ${insertError.message}`);
        } else {
          results.analyzed++;
        }
      } catch (analysisError) {
        results.errors.push(`Failed to analyze episode ${job.episode_id}: ${analysisError}`);
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
