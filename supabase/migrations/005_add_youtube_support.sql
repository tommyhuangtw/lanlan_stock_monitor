-- =============================================
-- Migration 005: YouTube Support
-- Adds YouTube sources and extends transcription_jobs for Apify
-- =============================================

-- 1. Add provider column to transcription_jobs
ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'assemblyai';

-- Add check constraint (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transcription_jobs_provider_check'
  ) THEN
    ALTER TABLE transcription_jobs
      ADD CONSTRAINT transcription_jobs_provider_check
      CHECK (provider IN ('assemblyai', 'apify'));
  END IF;
END $$;

-- 2. Add apify_run_id column
ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS apify_run_id TEXT;

-- 3. Insert YouTube sources
INSERT INTO sources (id, name, type, youtube_channel_id, description) VALUES
  ('nick-us-stock', 'Nick 美股咖啡館', 'youtube', 'UCjrP2TtSTifuRJ76hW2IW1A', 'Nick 美股分析'),
  ('nana-us-stock', 'NaNa说美股', 'youtube', 'UCFhJ8ZFg9W4kLwFTBBNIjOw', 'NaNa 美股解讀'),
  ('sunny-finance', '陽光財經', 'youtube', 'UC2I5em6UyBpQiO-8ZW0nV3w', '陽光財經分析')
ON CONFLICT (id) DO NOTHING;

-- 4. Index for provider-based queries
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_provider ON transcription_jobs(provider, status);
