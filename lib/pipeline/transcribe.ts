import { supabaseAdmin } from '../supabase';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface TranscribeResult {
  assemblyai: { submitted: number; completed: number; failed: number };
  apify: { submitted: number; completed: number; failed: number };
  totalPollCycles: number;
  errors: string[];
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

/**
 * Submit all pending transcription jobs and poll until all complete.
 * Unlike the original cron which processed one job at a time,
 * this submits ALL pending jobs in parallel and waits for completion.
 */
export async function transcribeAll(): Promise<TranscribeResult> {
  const results: TranscribeResult = {
    assemblyai: { submitted: 0, completed: 0, failed: 0 },
    apify: { submitted: 0, completed: 0, failed: 0 },
    totalPollCycles: 0,
    errors: [],
  };

  // =============================================
  // PHASE 1: Submit ALL pending jobs
  // =============================================

  // Submit pending AssemblyAI (podcast) jobs
  const { data: pendingAssemblyJobs } = await supabaseAdmin
    .from('transcription_jobs')
    .select(`*, episodes ( id, audio_url )`)
    .eq('status', 'pending')
    .eq('provider', 'assemblyai')
    .order('created_at', { ascending: true });

  for (const job of pendingAssemblyJobs || []) {
    const episode = job.episodes as unknown as { id: number; audio_url: string };
    if (!episode?.audio_url) {
      await markJobFailed(job.id, 'No audio URL');
      results.assemblyai.failed++;
      continue;
    }

    try {
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AssemblyAI API error: ${errorText}`);
      }

      const result = await response.json();

      await supabaseAdmin
        .from('transcription_jobs')
        .update({
          assemblyai_id: result.id,
          status: 'processing',
        })
        .eq('id', job.id);

      results.assemblyai.submitted++;
    } catch (error) {
      results.errors.push(`Failed to submit AssemblyAI job ${job.id}: ${error}`);
      await markJobFailed(job.id, String(error));
      results.assemblyai.failed++;
    }
  }

  // Submit pending Apify (YouTube) jobs
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (apifyToken) {
    const { data: pendingApifyJobs } = await supabaseAdmin
      .from('transcription_jobs')
      .select(`*, episodes ( id, audio_url )`)
      .eq('status', 'pending')
      .eq('provider', 'apify')
      .order('created_at', { ascending: true });

    for (const job of pendingApifyJobs || []) {
      const episode = job.episodes as unknown as { id: number; audio_url: string };
      if (!episode?.audio_url) {
        await markJobFailed(job.id, 'No video URL');
        results.apify.failed++;
        continue;
      }

      try {
        const response = await fetch(
          `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/runs?token=${apifyToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoUrl: episode.audio_url }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Apify API error: ${errorText}`);
        }

        const result = await response.json();
        const runId = result.data?.id;

        if (!runId) {
          throw new Error('No run ID returned from Apify');
        }

        await supabaseAdmin
          .from('transcription_jobs')
          .update({
            apify_run_id: runId,
            status: 'processing',
          })
          .eq('id', job.id);

        results.apify.submitted++;
      } catch (error) {
        results.errors.push(`Failed to submit Apify job ${job.id}: ${error}`);
        await markJobFailed(job.id, String(error));
        results.apify.failed++;
      }
    }
  }

  // =============================================
  // PHASE 2: Poll until ALL jobs complete
  // =============================================
  const POLL_INTERVAL = 15_000; // 15 seconds
  const MAX_WAIT = 30 * 60 * 1000; // 30 minutes safety cap
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_WAIT) {
      results.errors.push('Transcription timed out after 30 minutes');
      break;
    }

    // Check all processing jobs
    const { data: processingJobs } = await supabaseAdmin
      .from('transcription_jobs')
      .select('*')
      .eq('status', 'processing');

    if (!processingJobs || processingJobs.length === 0) {
      break; // All done
    }

    results.totalPollCycles++;

    for (const job of processingJobs) {
      if (job.provider === 'assemblyai' && job.assemblyai_id) {
        await checkAssemblyAIJob(job, results);
      } else if (job.provider === 'apify' && job.apify_run_id && apifyToken) {
        await checkApifyJob(job, apifyToken, results);
      }
    }

    // Re-check if any jobs still processing
    const { data: stillProcessing } = await supabaseAdmin
      .from('transcription_jobs')
      .select('id')
      .eq('status', 'processing');

    if (!stillProcessing || stillProcessing.length === 0) {
      break;
    }

    console.log(`  [poll cycle ${results.totalPollCycles}] ${stillProcessing.length} jobs still processing, waiting ${POLL_INTERVAL / 1000}s...`);
    await sleep(POLL_INTERVAL);
  }

  return results;
}

async function checkAssemblyAIJob(
  job: { id: number; assemblyai_id: string },
  results: TranscribeResult
) {
  try {
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
      return;
    }

    const result = await response.json();

    if (result.status === 'completed') {
      await supabaseAdmin
        .from('transcription_jobs')
        .update({
          status: 'completed',
          transcript: result.text,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      results.assemblyai.completed++;
    } else if (result.status === 'error') {
      await supabaseAdmin
        .from('transcription_jobs')
        .update({
          status: 'failed',
          error_message: result.error || 'Unknown error',
        })
        .eq('id', job.id);

      results.assemblyai.failed++;
    }
    // else still processing - will check again next cycle
  } catch (error) {
    results.errors.push(`Error checking AssemblyAI job ${job.id}: ${error}`);
  }
}

async function checkApifyJob(
  job: { id: number; apify_run_id: string },
  apifyToken: string,
  results: TranscribeResult
) {
  try {
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${job.apify_run_id}?token=${apifyToken}`
    );

    if (!statusRes.ok) {
      results.errors.push(`Apify status check failed for run ${job.apify_run_id}`);
      return;
    }

    const statusData = await statusRes.json();
    const runStatus = statusData.data?.status;

    if (runStatus === 'SUCCEEDED') {
      const datasetId = statusData.data?.defaultDatasetId;
      if (!datasetId) {
        await markJobFailed(job.id, 'No dataset ID returned');
        results.apify.failed++;
        return;
      }

      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`
      );

      if (!itemsRes.ok) {
        await markJobFailed(job.id, 'Failed to fetch dataset items');
        results.apify.failed++;
        return;
      }

      const items = await itemsRes.json();

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
        await markJobFailed(job.id, 'No transcript available or too short');
        results.apify.failed++;
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from('transcription_jobs')
        .update({
          status: 'completed',
          transcript,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (updateError) {
        results.errors.push(`Failed to save transcript for job ${job.id}: ${updateError.message}`);
        results.apify.failed++;
      } else {
        results.apify.completed++;
      }
    } else if (runStatus === 'FAILED' || runStatus === 'ABORTED' || runStatus === 'TIMED-OUT') {
      await markJobFailed(job.id, `Apify run ${runStatus}`);
      results.apify.failed++;
    }
    // else still running - will check again next cycle
  } catch (error) {
    results.errors.push(`Error polling Apify run ${job.apify_run_id}: ${error}`);
  }
}
