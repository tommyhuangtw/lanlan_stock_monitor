-- Store each stock's sector so the watchlist can be limited to tech names.
--
-- Yahoo's assetProfile is the source. ETFs and indices return no profile, so
-- both columns stay NULL for them — which is how they get excluded.

ALTER TABLE watchlist_stocks
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS sector_checked_at TIMESTAMPTZ;

-- Cleanup scans filter on sector, and lookups are per active stock.
CREATE INDEX IF NOT EXISTS idx_watchlist_sector
  ON watchlist_stocks(status, sector);

COMMENT ON COLUMN watchlist_stocks.sector IS
  'Yahoo assetProfile sector, e.g. Technology / Communication Services. NULL for ETFs.';
COMMENT ON COLUMN watchlist_stocks.sector_checked_at IS
  'When the sector was last fetched; NULL means never looked up.';

-- The tech verdict itself, cached so a stock is judged once and never
-- re-classified — otherwise an archive decision could flip between runs.
ALTER TABLE watchlist_stocks
  ADD COLUMN IF NOT EXISTS is_tech BOOLEAN,
  ADD COLUMN IF NOT EXISTS tech_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_watchlist_is_tech
  ON watchlist_stocks(status, is_tech);
