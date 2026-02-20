import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import Parser from 'rss-parser';

const parser = new Parser();

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  // Also allow Vercel Cron (it sends a specific header)
  const vercelCron = request.headers.get('x-vercel-cron');
  return vercelCron === '1';
}

export async function GET(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    processed: 0,
    newEpisodes: 0,
    pendingJobs: 0,
    errors: [] as string[],
  };

  try {
    // 1. Get all active sources
    const { data: sources, error: sourcesError } = await supabaseAdmin
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .eq('type', 'podcast'); // Only process podcasts for now

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    if (!sources || sources.length === 0) {
      return NextResponse.json({ message: 'No active sources found', ...results });
    }

    // 2. Process each source
    for (const source of sources) {
      if (!source.rss_url) {
        results.errors.push(`Source ${source.id} has no RSS URL`);
        continue;
      }

      try {
        const feed = await parser.parseURL(source.rss_url);
        results.processed++;

        // Process latest 5 items from feed
        for (const item of feed.items.slice(0, 1)) {
          const externalId = item.guid || item.link || item.title;
          if (!externalId) continue;

          // Check if episode already exists
          const { data: existing } = await supabaseAdmin
            .from('episodes')
            .select('id')
            .eq('external_id', externalId)
            .single();

          if (existing) {
            continue; // Skip existing episodes
          }

          // Get audio URL from enclosure
          const audioUrl = item.enclosure?.url ||
                          (item as unknown as { enclosure?: { url?: string } }).enclosure?.url;

          // Insert new episode
          const { data: episode, error: episodeError } = await supabaseAdmin
            .from('episodes')
            .insert({
              source_id: source.id,
              external_id: externalId,
              title: item.title || 'Untitled',
              audio_url: audioUrl,
              published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
            })
            .select()
            .single();

          if (episodeError) {
            results.errors.push(`Failed to insert episode: ${episodeError.message}`);
            continue;
          }

          results.newEpisodes++;

          // Create PENDING transcription job (don't submit to AssemblyAI yet)
          // The check-transcriptions cron will submit one at a time
          if (episode && audioUrl) {
            const { error: jobError } = await supabaseAdmin
              .from('transcription_jobs')
              .insert({
                episode_id: episode.id,
                status: 'pending', // Will be submitted later, one at a time
              });

            if (jobError) {
              results.errors.push(`Failed to create job: ${jobError.message}`);
            } else {
              results.pendingJobs++;
            }
          }
        }
      } catch (feedError) {
        results.errors.push(`Failed to parse feed ${source.id}: ${feedError}`);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Process feeds error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
