-- Switch podcast speech-to-text from AssemblyAI to OpenAI.
--
-- Podcast jobs are created without an explicit provider (fetch-feeds.ts relies
-- on the column default), so flipping the default is what actually reroutes
-- them. YouTube keeps using Apify, which is set explicitly in fetch-youtube.ts.

ALTER TABLE transcription_jobs
  DROP CONSTRAINT IF EXISTS transcription_jobs_provider_check;

ALTER TABLE transcription_jobs
  ADD CONSTRAINT transcription_jobs_provider_check
  CHECK (provider IN ('openai', 'assemblyai', 'apify'));

ALTER TABLE transcription_jobs
  ALTER COLUMN provider SET DEFAULT 'openai';

-- Any job still queued for AssemblyAI would never be picked up again — that
-- code path is gone. There were none at migration time; this is a safety net.
UPDATE transcription_jobs
  SET provider = 'openai'
  WHERE provider = 'assemblyai'
    AND status IN ('pending', 'processing');

-- 'assemblyai' stays in the CHECK list so the 320 completed historical rows
-- remain valid and still show where those transcripts came from.
