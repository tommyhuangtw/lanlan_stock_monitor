-- =============================================
-- Migration 002: Add Email Caching Tables
-- =============================================

-- 1. Add full_analysis column to analyses table
ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS full_analysis JSONB;

-- 2. Daily Digests - Cache consolidated reports by source combination
CREATE TABLE IF NOT EXISTS daily_digests (
  id SERIAL PRIMARY KEY,

  -- Date (in Taipei timezone)
  digest_date DATE NOT NULL,

  -- Unique key for source combination (sorted source_ids joined by |)
  source_combination_key TEXT NOT NULL,

  -- Array of source IDs for this combination
  source_ids TEXT[] NOT NULL,

  -- Email type: daily or weekly
  email_type TEXT NOT NULL CHECK (email_type IN ('daily', 'weekly')),

  -- Episode IDs included in this digest
  episode_ids INT[] NOT NULL DEFAULT '{}',

  -- Cached AI-generated content
  consolidated_report JSONB NOT NULL DEFAULT '{}',
  quick_digest TEXT[] NOT NULL DEFAULT '{}',
  market_mood TEXT NOT NULL DEFAULT '',

  -- Pre-generated HTML template (without magic link)
  html_template TEXT NOT NULL DEFAULT '',

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'no_content')),
  error_message TEXT,

  -- Statistics
  emails_sent INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Unique constraint: one digest per date/combination/type
  UNIQUE(digest_date, source_combination_key, email_type)
);

-- 3. Digest Emails - Track email delivery per user
CREATE TABLE IF NOT EXISTS digest_emails (
  id SERIAL PRIMARY KEY,

  -- Reference to cached digest
  daily_digest_id INT REFERENCES daily_digests(id) ON DELETE CASCADE,

  -- User info
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- User-specific magic link
  magic_link_url TEXT NOT NULL,

  -- Delivery status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),

  -- Resend API response ID
  resend_id TEXT,

  -- Error message if failed
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,

  -- Unique constraint: one email per digest per user
  UNIQUE(daily_digest_id, user_id)
);

-- 4. Source Combinations Registry - Track all existing combinations
CREATE TABLE IF NOT EXISTS source_combinations (
  -- Unique key (sorted source_ids joined by |)
  combination_key TEXT PRIMARY KEY,

  -- Array of source IDs
  source_ids TEXT[] NOT NULL,

  -- Number of subscribers with this combination
  subscriber_count INT DEFAULT 0,

  -- Last time this combination was used
  last_used_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_daily_digests_date
  ON daily_digests(digest_date);

CREATE INDEX IF NOT EXISTS idx_daily_digests_combination
  ON daily_digests(source_combination_key);

CREATE INDEX IF NOT EXISTS idx_daily_digests_status
  ON daily_digests(status);

CREATE INDEX IF NOT EXISTS idx_daily_digests_date_combo_type
  ON daily_digests(digest_date, source_combination_key, email_type);

CREATE INDEX IF NOT EXISTS idx_digest_emails_digest
  ON digest_emails(daily_digest_id);

CREATE INDEX IF NOT EXISTS idx_digest_emails_user
  ON digest_emails(user_id);

CREATE INDEX IF NOT EXISTS idx_digest_emails_status
  ON digest_emails(status);

CREATE INDEX IF NOT EXISTS idx_source_combinations_count
  ON source_combinations(subscriber_count) WHERE subscriber_count > 0;

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_combinations ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to daily_digests"
  ON daily_digests FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to digest_emails"
  ON digest_emails FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to source_combinations"
  ON source_combinations FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================
-- Helper Functions
-- =============================================

-- Function to increment subscriber count
CREATE OR REPLACE FUNCTION increment_combination_count(
  p_key TEXT,
  p_source_ids TEXT[]
)
RETURNS void AS $$
BEGIN
  INSERT INTO source_combinations (combination_key, source_ids, subscriber_count, last_used_at)
  VALUES (p_key, p_source_ids, 1, NOW())
  ON CONFLICT (combination_key)
  DO UPDATE SET
    subscriber_count = source_combinations.subscriber_count + 1,
    last_used_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement subscriber count
CREATE OR REPLACE FUNCTION decrement_combination_count(p_key TEXT)
RETURNS void AS $$
BEGIN
  UPDATE source_combinations
  SET subscriber_count = GREATEST(0, subscriber_count - 1),
      last_used_at = NOW()
  WHERE combination_key = p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment emails_sent count
CREATE OR REPLACE FUNCTION increment_emails_sent(p_digest_id INT)
RETURNS void AS $$
BEGIN
  UPDATE daily_digests
  SET emails_sent = emails_sent + 1
  WHERE id = p_digest_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
