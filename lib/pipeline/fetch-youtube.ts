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

type Source = { id: string; name: string; youtube_channel_id: string };

// Throws QuotaError on 403/429 so the caller can switch to Apify for the rest of the run.
class QuotaError extends Error {}

async function fetchViaYoutubeApi(
  source: Source,
  apiKey: string,
  since: Date
): Promise<YouTubeVideo[]> {
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('channelId', source.youtube_channel_id);
  searchUrl.searchParams.set('publishedAfter', since.toISOString());
  searchUrl.searchParams.set('order', 'date');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('maxResults', '1');
  searchUrl.searchParams.set('key', apiKey);

  const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(30000) });
  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    const msg = `YouTube search failed for ${source.id}: ${errorText}`;
    throw searchRes.status === 429 || searchRes.status === 403 ? new QuotaError(msg) : new Error(msg);
  }

  const searchData = await searchRes.json();
  const videoIds = (searchData.items || [])
    .map((item: { id: { videoId: string } }) => item.id.videoId)
    .filter(Boolean);
  if (videoIds.length === 0) return [];

  // Get video details (duration, views)
  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  detailsUrl.searchParams.set('id', videoIds.join(','));
  detailsUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
  detailsUrl.searchParams.set('key', apiKey);

  const detailsRes = await fetch(detailsUrl.toString(), { signal: AbortSignal.timeout(30000) });
  if (!detailsRes.ok) {
    const errorText = await detailsRes.text();
    const msg = `YouTube details failed for ${source.id}: ${errorText}`;
    throw detailsRes.status === 429 || detailsRes.status === 403 ? new QuotaError(msg) : new Error(msg);
  }

  const detailsData = await detailsRes.json();
  const videos: YouTubeVideo[] = [];
  for (const video of detailsData.items || []) {
    if (!video.id || !video.contentDetails || !video.statistics || !video.snippet) continue;
    if (new Date(video.snippet.publishedAt) < since) continue;

    videos.push({
      videoId: video.id,
      title: video.snippet.title,
      channelName: source.name,
      publishedAt: video.snippet.publishedAt,
      durationSeconds: isoDurationToSeconds(video.contentDetails.duration),
      viewCount: parseInt(video.statistics.viewCount || '0', 10),
      thumbnailUrl:
        video.snippet.thumbnails?.maxres?.url ||
        video.snippet.thumbnails?.high?.url ||
        video.snippet.thumbnails?.medium?.url || '',
      videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
    });
  }
  return videos;
}

// Fallback when the YouTube API quota is exhausted (search.list = 100 units/call, 10k/day).
async function fetchViaApify(source: Source, token: string, since: Date): Promise<YouTubeVideo[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: `https://www.youtube.com/channel/${source.youtube_channel_id}/videos` }],
        maxResults: 1,
        maxResultsShorts: 0,
        maxResultStreams: 0,
      }),
      signal: AbortSignal.timeout(180000),
    }
  );
  if (!res.ok) throw new Error(`Apify YouTube scrape failed for ${source.id}: ${await res.text()}`);

  const items: Array<{
    id?: string; title?: string; date?: string; duration?: string;
    viewCount?: number; thumbnailUrl?: string; error?: string;
  }> = await res.json();

  const videos: YouTubeVideo[] = [];
  for (const item of items) {
    if (item.error || !item.id || !item.date || new Date(item.date) < since) continue;
    const durationSeconds = (item.duration || '0').split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
    videos.push({
      videoId: item.id,
      title: item.title || '',
      channelName: source.name,
      publishedAt: item.date,
      durationSeconds,
      viewCount: item.viewCount || 0,
      thumbnailUrl: item.thumbnailUrl || '',
      videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
    });
  }
  return videos;
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
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apiKey && !apifyToken) {
    throw new Error('Neither YOUTUBE_API_KEY nor APIFY_API_TOKEN configured');
  }
  let quotaExhausted = !apiKey; // once true, remaining sources go straight to Apify

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

      let validVideos: YouTubeVideo[];
      if (!quotaExhausted) {
        try {
          validVideos = await fetchViaYoutubeApi(source, apiKey!, twoDaysAgo);
        } catch (err) {
          if (!(err instanceof QuotaError) || !apifyToken) {
            results.errors.push(String(err instanceof Error ? err.message : err));
            continue;
          }
          console.warn(`YouTube API quota exhausted, switching to Apify: ${err.message}`);
          quotaExhausted = true;
          validVideos = await fetchViaApify(source, apifyToken, twoDaysAgo);
        }
      } else {
        if (!apifyToken) {
          results.errors.push(`YouTube quota exhausted and APIFY_API_TOKEN missing for ${source.id}`);
          continue;
        }
        validVideos = await fetchViaApify(source, apifyToken, twoDaysAgo);
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
