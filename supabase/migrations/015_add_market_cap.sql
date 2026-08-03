-- Market cap, used to rank better-known companies higher in /機會.
--
-- Stored in USD. Yahoo reports TW listings in TWD, so those are converted on
-- write — otherwise a NT$50B small cap would outrank a US$20B one.

ALTER TABLE watchlist_stocks
  ADD COLUMN IF NOT EXISTS market_cap_usd BIGINT;

COMMENT ON COLUMN watchlist_stocks.market_cap_usd IS
  'Market cap in USD. TW listings converted from TWD on write. NULL for ETFs.';
