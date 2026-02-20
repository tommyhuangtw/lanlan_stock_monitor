import { supabaseAdmin } from '../supabase';

function isoDurationToSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  channelName: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  thumbnailUrl: string;
  videoUrl: string;
}

export interface FetchYoutubeResult {
  sourcesProcessed: number;
  videosFound: number;
  newEpisodes: number;
  pendingJobs: number;
  errors: string[];
}

export async function fetchYoutube(): Promise<FetchYoutubeResult> {
  const results: FetchYoutubeResult = {
    sourcesProcessed: 0,
    videosFound: 0,
    newEpisodes: 0,
    pendingJobs: 0,
    errors: [],
  };

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY not configured');
  }

  // 1. Get all active YouTube sources
  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from('sources')
    .select('*')
    .eq('is_active', true)
    .eq('type', 'youtube');

  if (sourcesError) {
    throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
  }

  if (!sources || sources.length === 0) {
    return results;
  }

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // 2. Process each YouTube channel
  for (const source of sources) {
    if (!source.youtube_channel_id) {
      results.errors.push(`Source ${source.id} has no youtube_channel_id`);
      continue;
    }

    try {
      results.sourcesProcessed++;

      // Search for recent videos
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('channelId', source.youtube_channel_id);
      searchUrl.searchParams.set('publishedAfter', twoDaysAgo.toISOString());
      searchUrl.searchParams.set('order', 'date');
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('maxResults', '1');
      searchUrl.searchParams.set('key', apiKey);

      const searchRes = await fetch(searchUrl.toString(), {
        signal: AbortSignal.timeout(30000),
      });

      if (!searchRes.ok) {
        const errorText = await searchRes.text();
        results.errors.push(`YouTube search failed for ${source.id}: ${errorText}`);
        continue;
      }

      const searchData = await searchRes.json();
      const videoIds = (searchData.items || [])
        .map((item: { id: { videoId: string } }) => item.id.videoId)
        .filter(Boolean);

      if (videoIds.length === 0) {
        continue;
      }

      // Get video details (duration, views)
      const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      detailsUrl.searchParams.set('id', videoIds.join(','));
      detailsUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
      detailsUrl.searchParams.set('key', apiKey);

      const detailsRes = await fetch(detailsUrl.toString(), {
        signal: AbortSignal.timeout(30000),
      });

      if (!detailsRes.ok) {
        results.errors.push(`YouTube details failed for ${source.id}`);
        continue;
      }

      const detailsData = await detailsRes.json();

      // Filter videos
      const validVideos: YouTubeVideo[] = [];
      for (const video of detailsData.items || []) {
        if (!video.id || !video.contentDetails || !video.statistics || !video.snippet) continue;

        const publishedAt = new Date(video.snippet.publishedAt);
        const durationSec = isoDurationToSeconds(video.contentDetails.duration);
        const viewCount = parseInt(video.statistics.viewCount || '0', 10);

        if (publishedAt < twoDaysAgo) continue;

        validVideos.push({
          videoId: video.id,
          title: video.snippet.title,
          channelName: source.name,
          publishedAt: video.snippet.publishedAt,
          durationSeconds: durationSec,
          viewCount,
          thumbnailUrl:
            video.snippet.thumbnails?.maxres?.url ||
            video.snippet.thumbnails?.high?.url ||
            video.snippet.thumbnails?.medium?.url || '',
          videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
        });
      }

      results.videosFound += validVideos.length;

      // 3. Insert new episodes
      for (const video of validVideos) {
        const externalId = `yt_${video.videoId}`;

        // Check if episode already exists
        const { data: existing } = await supabaseAdmin
          .from('episodes')
          .select('id')
          .eq('external_id', externalId)
          .single();

        if (existing) continue;

        // Insert episode
        const { data: episode, error: episodeError } = await supabaseAdmin
          .from('episodes')
          .insert({
            source_id: source.id,
            external_id: externalId,
            title: video.title,
            audio_url: video.videoUrl,
            duration_seconds: video.durationSeconds,
            published_at: video.publishedAt,
          })
          .select()
          .single();

        if (episodeError) {
          results.errors.push(`Failed to insert episode ${externalId}: ${episodeError.message}`);
          continue;
        }

        results.newEpisodes++;

        // Create pending transcription job with Apify provider
        if (episode) {
          const { error: jobError } = await supabaseAdmin
            .from('transcription_jobs')
            .insert({
              episode_id: episode.id,
              status: 'pending',
              provider: 'apify',
            });

          if (jobError) {
            results.errors.push(`Failed to create job for ${externalId}: ${jobError.message}`);
          } else {
            results.pendingJobs++;
          }
        }
      }
    } catch (feedError) {
      results.errors.push(`Failed to process YouTube source ${source.id}: ${feedError}`);
    }
  }

  return results;
}
