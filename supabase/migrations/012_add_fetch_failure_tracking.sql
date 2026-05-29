-- Track consecutive fetch failures for auto-cleanup of delisted/invalid stocks
ALTER TABLE watchlist_stocks
  ADD COLUMN IF NOT EXISTS consecutive_fetch_failures INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;
