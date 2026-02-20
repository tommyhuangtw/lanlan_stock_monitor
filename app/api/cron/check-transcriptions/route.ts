import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Allow up to 60s for Apify poll loop (Vercel Hobby supports this)
export const maxDuration = 60;

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  const vercelCron = request.headers.get('x-vercel-cron');
  return vercelCron === '1';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    // AssemblyAI
    assemblyai: {
      checked: 0,
      completed: 0,
      failed: 0,
      stillProcessing: 0,
      newJobSubmitted: false,
    },
    // Apify
    apify: {
      checked: 0,
      completed: 0,
      failed: 0,
      stillProcessing: 0,
      newJobSubmitted: false,
      pollCycles: 0,
    },
    pendingCount: 0,
    errors: [] as string[],
  };

  try {
    // =============================================
    // PART 1: AssemblyAI (Podcast) — existing logic
    // =============================================

    // 1a. Check all currently processing AssemblyAI jobs
    const { data: assemblyProcessingJobs, error: assemblyJobsError } = await supabaseAdmin
      .from('transcription_jobs')
      .select('*')
      .eq('status', 'processing')
      .eq('provider', 'assemblyai');

    if (assemblyJobsError) {
      results.errors.push(`Failed to fetch AssemblyAI jobs: ${assemblyJobsError.message}`);
    }

    for (const job of assemblyProcessingJobs || []) {
      if (!job.assemblyai_id) {
        results.errors.push(`Job ${job.id} has no AssemblyAI ID`);
        continue;
      }

      try {
        results.assemblyai.checked++;

        const response = await fetch(
          `https://api.assemblyai.com/v2/transcript/${job.assemblyai_id}`,
          {
            headers: {
              'Authorization': process.env.ASSEMBLYAI_API_KEY!,
            },
          }
        );

        if (!response.ok) {
          results.errors.push(`AssemblyAI API error for job ${job.id}`);
          continue;
        }

        const result = await response.json();

        if (result.status === 'completed') {
          const { error: updateError } = await supabaseAdmin
            .from('transcription_jobs')
            .update({
              status: 'completed',
              transcript: result.text,
              completed_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          if (updateError) {
            results.errors.push(`Failed to update job ${job.id}: ${updateError.message}`);
          } else {
            results.assemblyai.completed++;
          }
        } else if (result.status === 'error') {
          const { error: updateError } = await supabaseAdmin
            .from('transcription_jobs')
            .update({
              status: 'failed',
              error_message: result.error || 'Unknown error',
            })
            .eq('id', job.id);

          if (updateError) {
            results.errors.push(`Failed to update job ${job.id}: ${updateError.message}`);
          } else {
            results.assemblyai.failed++;
          }
        } else {
          results.assemblyai.stillProcessing++;
        }
      } catch (error) {
        results.errors.push(`Error checking AssemblyAI job ${job.id}: ${error}`);
      }
    }

    // 1b. If no AssemblyAI jobs processing, submit one pending podcast job
    const { data: currentAssemblyProcessing } = await supabaseAdmin
      .from('transcription_jobs')
      .select('id')
      .eq('status', 'processing')
      .eq('provider', 'assemblyai');

    if ((currentAssemblyProcessing?.length || 0) === 0) {
      const { data: pendingPodcastJobs } = await supabaseAdmin
        .from('transcription_jobs')
        .select(`
          *,
          episodes (
            id,
            audio_url
          )
        `)
        .eq('status', 'pending')
        .eq('provider', 'assemblyai')
        .order('created_at', { ascending: true })
        .limit(1);

      if (pendingPodcastJobs && pendingPodcastJobs.length > 0) {
        const job = pendingPodcastJobs[0];
        const episode = job.episodes as unknown as { id: number; audio_url: string };

        if (episode?.audio_url) {
          try {
            const assemblyResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
              method: 'POST',
              headers: {
                'Authorization': process.env.ASSEMBLYAI_API_KEY!,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                audio_url: episode.audio_url,
                language_code: 'zh',
              }),
            });

            if (!assemblyResponse.ok) {
              const errorText = await assemblyResponse.text();
              throw new Error(`AssemblyAI API error: ${errorText}`);
            }

            const assemblyResult = await assemblyResponse.json();

            const { error: updateError } = await supabaseAdmin
              .from('transcription_jobs')
              .update({
                assemblyai_id: assemblyResult.id,
                status: 'processing',
              })
              .eq('id', job.id);

            if (updateError) {
              results.errors.push(`Failed to update job ${job.id}: ${updateError.message}`);
            } else {
              results.assemblyai.newJobSubmitted = true;
            }
          } catch (error) {
            results.errors.push(`Failed to submit AssemblyAI job ${job.id}: ${error}`);
            await supabaseAdmin
              .from('transcription_jobs')
              .update({
                status: 'failed',
                error_message: String(error),
              })
              .eq('id', job.id);
          }
        }
      }
    }

    // =============================================
    // PART 2: Apify (YouTube) — new logic
    // =============================================
    const apifyToken = process.env.APIFY_API_TOKEN;

    if (apifyToken) {
      // 2a. Check if there's a processing Apify job (from a previous cycle)
      const { data: apifyProcessingJobs } = await supabaseAdmin
        .from('transcription_jobs')
        .select('*')
        .eq('status', 'processing')
        .eq('provider', 'apify');

      let apifyBusy = false;

      for (const job of apifyProcessingJobs || []) {
        if (!job.apify_run_id) {
          results.errors.push(`Apify job ${job.id} has no run ID`);
          continue;
        }

        apifyBusy = true;
        results.apify.checked++;

        try {
          const completed = await pollApifyRun(job.apify_run_id, apifyToken, job.id, results, startTime);
          if (completed) {
            apifyBusy = false;
          }
        } catch (error) {
          results.errors.push(`Error checking Apify job ${job.id}: ${error}`);
        }
      }

      // 2b. If no Apify job is processing, submit one pending YouTube job
      if (!apifyBusy) {
        const { data: pendingYoutubeJobs } = await supabaseAdmin
          .from('transcription_jobs')
          .select(`
            *,
            episodes (
              id,
              audio_url
            )
          `)
          .eq('status', 'pending')
          .eq('provider', 'apify')
          .order('created_at', { ascending: true })
          .limit(1);

        if (pendingYoutubeJobs && pendingYoutubeJobs.length > 0) {
          const job = pendingYoutubeJobs[0];
          const episode = job.episodes as unknown as { id: number; audio_url: string };

          if (episode?.audio_url) {
            try {
              // Submit Apify run
              const apifyResponse = await fetch(
                `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/runs?token=${apifyToken}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ videoUrl: episode.audio_url }),
                }
              );

              if (!apifyResponse.ok) {
                const errorText = await apifyResponse.text();
                throw new Error(`Apify API error: ${errorText}`);
              }

              const apifyResult = await apifyResponse.json();
              const runId = apifyResult.data?.id;

              if (!runId) {
                throw new Error('No run ID returned from Apify');
              }

              // Save run ID and mark as processing
              const { error: updateError } = await supabaseAdmin
                .from('transcription_jobs')
                .update({
                  apify_run_id: runId,
                  status: 'processing',
                })
                .eq('id', job.id);

              if (updateError) {
                results.errors.push(`Failed to update job ${job.id}: ${updateError.message}`);
              } else {
                results.apify.newJobSubmitted = true;

                // Poll in loop every 10s until done or approaching timeout
                await pollApifyRun(runId, apifyToken, job.id, results, startTime);
              }
            } catch (error) {
              results.errors.push(`Failed to submit Apify job ${job.id}: ${error}`);
              await supabaseAdmin
                .from('transcription_jobs')
                .update({
                  status: 'failed',
                  error_message: String(error),
                })
                .eq('id', job.id);
            }
          }
        }
      }
    }

    // Get remaining pending count (all providers)
    const { count } = await supabaseAdmin
      .from('transcription_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    results.pendingCount = count || 0;

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Check transcriptions error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Poll an Apify run until it completes or we approach the function timeout.
 * Returns true if the job completed (success or failure), false if still running.
 */
async function pollApifyRun(
  runId: string,
  apifyToken: string,
  jobId: number,
  results: { apify: { completed: number; failed: number; stillProcessing: number; pollCycles: number }; errors: string[] },
  startTime: number
): Promise<boolean> {
  const POLL_INTERVAL = 10_000; // 10 seconds
  const MAX_ELAPSED = 50_000; // Stop polling at 50s to leave buffer before 60s timeout

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_ELAPSED) {
      // Approaching timeout — save progress for next cron cycle
      results.apify.stillProcessing++;
      return false;
    }

    results.apify.pollCycles++;

    try {
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
      );

      if (!statusRes.ok) {
        results.errors.push(`Apify status check failed for run ${runId}`);
        return false;
      }

      const statusData = await statusRes.json();
      const runStatus = statusData.data?.status;

      if (runStatus === 'SUCCEEDED') {
        // Fetch dataset items
        const datasetId = statusData.data?.defaultDatasetId;
        if (!datasetId) {
          results.errors.push(`No dataset ID for Apify run ${runId}`);
          await markJobFailed(jobId, 'No dataset ID returned');
          results.apify.failed++;
          return true;
        }

        const itemsRes = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`
        );

        if (!itemsRes.ok) {
          results.errors.push(`Failed to fetch Apify dataset for run ${runId}`);
          await markJobFailed(jobId, 'Failed to fetch dataset items');
          results.apify.failed++;
          return true;
        }

        const items = await itemsRes.json();

        // Extract transcript text from items
        let transcript = '';
        if (Array.isArray(items) && items.length > 0) {
          const firstItem = items[0];
          if (firstItem.data && Array.isArray(firstItem.data)) {
            transcript = firstItem.data.map((seg: { text: string }) => seg.text).join(' ');
          } else if (firstItem.captions && Array.isArray(firstItem.captions)) {
            transcript = firstItem.captions.map((seg: { text: string }) => seg.text).join(' ');
          } else if (typeof firstItem.text === 'string') {
            transcript = firstItem.text;
          }
        }

        if (!transcript || transcript.trim().length < 100) {
          await markJobFailed(jobId, 'No transcript available or too short');
          results.apify.failed++;
          return true;
        }

        // Save transcript
        const { error: updateError } = await supabaseAdmin
          .from('transcription_jobs')
          .update({
            status: 'completed',
            transcript,
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        if (updateError) {
          results.errors.push(`Failed to save transcript for job ${jobId}: ${updateError.message}`);
          results.apify.failed++;
        } else {
          results.apify.completed++;
        }
        return true;

      } else if (runStatus === 'FAILED' || runStatus === 'ABORTED' || runStatus === 'TIMED-OUT') {
        await markJobFailed(jobId, `Apify run ${runStatus}`);
        results.apify.failed++;
        return true;
      }

      // Still running — wait and poll again
      await sleep(POLL_INTERVAL);

    } catch (error) {
      results.errors.push(`Error polling Apify run ${runId}: ${error}`);
      return false;
    }
  }
}

async function markJobFailed(jobId: number, errorMessage: string) {
  await supabaseAdmin
    .from('transcription_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
    })
    .eq('id', jobId);
}
