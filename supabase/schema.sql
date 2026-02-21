-- =============================================
-- 投資訊號監控 SaaS - Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  is_paid BOOLEAN DEFAULT false,
  selected_sources TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_email_sent TIMESTAMPTZ
);

-- 2. Sources (Admin managed)
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('podcast', 'youtube')),
  rss_url TEXT,
  youtube_channel_id TEXT,
  image_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Episodes
CREATE TABLE IF NOT EXISTS episodes (
  id SERIAL PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  audio_url TEXT,
  duration_seconds INT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Transcription Jobs
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id SERIAL PRIMARY KEY,
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE,
  assemblyai_id TEXT,
  provider TEXT DEFAULT 'assemblyai' CHECK (provider IN ('assemblyai', 'apify')),
  apify_run_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcript TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 5. AI Analyses
CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE UNIQUE,
  summary TEXT,
  key_points JSONB DEFAULT '[]',
  stocks_mentioned JSONB DEFAULT '[]',
  sentiment TEXT CHECK (sentiment IN ('bullish', 'bearish', 'neutral', 'mixed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL CHECK (email_type IN ('welcome', 'daily', 'weekly')),
  subject TEXT,
  episodes_included INT[] DEFAULT '{}',
  resend_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_episodes_source_published ON episodes(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_episode ON transcription_jobs(episode_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_provider ON transcription_jobs(provider, status);
CREATE INDEX IF NOT EXISTS idx_analyses_episode ON analyses(episode_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================
-- Initial Sources Data
-- =============================================
INSERT INTO sources (id, name, type, rss_url, description) VALUES
  ('gooaye', 'Gooaye 股癌', 'podcast', 'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml', 'Gooaye 股癌投資分析'),
  ('sailing-king', '美股航海王｜指數流', 'podcast', 'https://feed.firstory.me/rss/user/closlgwno050c01tz1bqh4nff', '美股投資分析'),
  ('leek-graduate', '韭菜畢業班', 'podcast', 'https://feeds.soundon.fm/podcasts/70907bd6-d0ae-4b64-bc38-2bf48ae4fc36.xml', '投資理財教育'),
  ('us-stock-academy', '美股投資學-財女珍妮', 'podcast', 'https://feeds.soundon.fm/podcasts/4a8660a0-e0d0-490b-8d46-c28219606f47.xml', '美股投資教學'),
  ('finance-horn', '游庭皓的財經皓角', 'podcast', 'https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss', '財經新聞分析')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, name, type, youtube_channel_id, description) VALUES
  ('nick-us-stock', 'Nick 美股咖啡館', 'youtube', 'UCjrP2TtSTifuRJ76hW2IW1A', 'Nick 美股分析'),
  ('nana-us-stock', 'NaNa說美股', 'youtube', 'UCFhJ8ZFg9W4kLwFTBBNIjOw', 'NaNa 美股解讀'),
  ('sunny-finance', '陽光財經', 'youtube', 'UC2I5em6UyBpQiO-8ZW0nV3w', '陽光財經分析')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- Row Level Security (RLS)
-- =============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Public read access for sources (for signup page)
CREATE POLICY "Sources are viewable by everyone" ON sources
  FOR SELECT USING (is_active = true);

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role has full access to users" ON users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to sources" ON sources
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to episodes" ON episodes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to transcription_jobs" ON transcription_jobs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to analyses" ON analyses
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to email_logs" ON email_logs
  FOR ALL USING (auth.role() = 'service_role');
