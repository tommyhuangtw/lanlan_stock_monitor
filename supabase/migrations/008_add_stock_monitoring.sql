-- =============================================
-- Migration 008: Add Stock Monitoring Tables
-- =============================================

-- 1. Watchlist Stocks - Master list of monitored stocks
CREATE TABLE IF NOT EXISTS watchlist_stocks (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,                    -- "AAPL" or "台積電 (2330)"
  ticker_normalized TEXT NOT NULL UNIQUE,  -- "AAPL" or "2330.TW"
  market TEXT NOT NULL CHECK (market IN ('US', 'TW')),
  name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),

  -- KOL signal aggregation
  first_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
  last_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
  mention_count INT DEFAULT 1,
  kol_sources JSONB DEFAULT '[]',         -- [{kol, reason, date, confidence, episodeId}]
  consensus TEXT,                          -- "多方共識" / "單一來源" / "觀點分歧"

  -- Price tracking
  price_at_first_mention DECIMAL(12,4),
  current_price DECIMAL(12,4),
  last_price_update TIMESTAMPTZ,

  -- KOL-mentioned price levels
  kol_price_levels JSONB DEFAULT '[]',    -- [{level, type: "support"/"target", kol, date}]

  -- Sector expansion fields
  sector_theme TEXT,                       -- "光通訊", "CPU", "AI 伺服器"
  sector_expansion_source JSONB,           -- {theme, kol, date, searchQuery}

  -- Source tracking
  added_by TEXT DEFAULT 'pipeline',        -- 'pipeline', 'sector_expansion', 'manual'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Stock Prices - Daily OHLCV history
CREATE TABLE IF NOT EXISTS stock_prices (
  id SERIAL PRIMARY KEY,
  ticker_normalized TEXT NOT NULL,
  price_date DATE NOT NULL,
  open_price DECIMAL(12,4),
  high_price DECIMAL(12,4),
  low_price DECIMAL(12,4),
  close_price DECIMAL(12,4) NOT NULL,
  volume BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker_normalized, price_date)
);

-- 3. Stock Alerts - Alert history and tracking
CREATE TABLE IF NOT EXISTS stock_alerts (
  id SERIAL PRIMARY KEY,
  watchlist_stock_id INT REFERENCES watchlist_stocks(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  market TEXT NOT NULL,

  -- Alert details
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'significant_drop_5pct',
    'significant_drop_10pct',
    'significant_drop_20pct',
    'rsi_oversold',
    'consolidation',
    'near_kol_support',
    'sma_support',
    'ai_entry_signal'
  )),

  -- Context
  trigger_price DECIMAL(12,4) NOT NULL,
  trigger_reason TEXT NOT NULL,
  technical_snapshot JSONB DEFAULT '{}',
  kol_context JSONB DEFAULT '[]',
  ai_analysis TEXT,

  -- Delivery
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed')),
  sent_via TEXT[] DEFAULT '{}',
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Notification Config - User notification preferences
CREATE TABLE IF NOT EXISTS notification_config (
  id SERIAL PRIMARY KEY,
  user_identifier TEXT UNIQUE NOT NULL DEFAULT 'tommy',

  -- Channel preferences
  line_channel_token TEXT,
  line_user_id TEXT,
  email TEXT,

  -- Alert preferences
  enabled_alert_types TEXT[] DEFAULT ARRAY[
    'significant_drop_5pct', 'significant_drop_10pct', 'significant_drop_20pct',
    'rsi_oversold', 'consolidation', 'near_kol_support', 'sma_support'
  ],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Sector Expansions - Track expanded sector themes
CREATE TABLE IF NOT EXISTS sector_expansions (
  id SERIAL PRIMARY KEY,
  theme TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'TW', 'both')),
  kol_source TEXT,
  kol_sources JSONB DEFAULT '[]',         -- [{kol, date, reason}]
  search_query TEXT,
  stocks_found JSONB DEFAULT '[]',        -- [{ticker, tickerNormalized, name, reason}]
  expanded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme, market)
);

-- =============================================
-- Indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_status
  ON watchlist_stocks(status);

CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_market
  ON watchlist_stocks(market);

CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_last_mentioned
  ON watchlist_stocks(last_mentioned_at);

CREATE INDEX IF NOT EXISTS idx_stock_prices_ticker_date
  ON stock_prices(ticker_normalized, price_date);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_status
  ON stock_alerts(status);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_created
  ON stock_alerts(created_at);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_type_ticker
  ON stock_alerts(alert_type, ticker, created_at);

CREATE INDEX IF NOT EXISTS idx_sector_expansions_theme
  ON sector_expansions(theme);

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE watchlist_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_expansions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to watchlist_stocks"
  ON watchlist_stocks FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to stock_prices"
  ON stock_prices FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to stock_alerts"
  ON stock_alerts FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to notification_config"
  ON notification_config FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to sector_expansions"
  ON sector_expansions FOR ALL
  USING (auth.role() = 'service_role');
