import { supabaseAdmin } from '../supabase';
import Parser from 'rss-parser';

const parser = new Parser();

export interface FetchFeedsResult {
  processed: number;
  newEpisodes: number;
  pendingJobs: number;
  errors: string[];
}

/**
 * @param sourceIds - when given, only these podcast sources are polled.
 *   Used by the Gooaye watcher so an off-schedule run doesn't pull every feed.
 */
export async function fetchFeeds(sourceIds?: string[]): Promise<FetchFeedsResult> {
  const results: FetchFeedsResult = {
    processed: 0,
    newEpisodes: 0,
    pendingJobs: 0,
    errors: [],
  };

  // 1. Get all active podcast sources
  let query = supabaseAdmin
    .from('sources')
    .select('*')
    .eq('is_active', true)
    .eq('type', 'podcast');
  if (sourceIds?.length) query = query.in('id', sourceIds);
  const { data: sources, error: sourcesError } = await query;

  if (sourcesError) {
    throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
  }

  if (!sources || sources.length === 0) {
    return results;
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

      // Process latest 1 item from feed
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
          continue;
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

        // Create PENDING transcription job
        if (episode && audioUrl) {
          const { error: jobError } = await supabaseAdmin
            .from('transcription_jobs')
            .insert({
              episode_id: episode.id,
              status: 'pending',
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

  return results;
}
