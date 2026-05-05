/**
 * Stock Data Module
 *
 * Fetches stock prices using yahoo-finance2.
 * Supports both US stocks (e.g. "AAPL") and Taiwan stocks (e.g. "2330.TW").
 */

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { supabaseAdmin } from './supabase';
import { log } from './logger';

interface YahooQuoteResult {
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  trailingPE?: number;
  forwardPE?: number;
}

interface YahooHistoricalBar {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface StockQuote {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trailingPE?: number;
  forwardPE?: number;
}

/**
 * Fetch the latest quote for a stock.
 */
export async function fetchLatestQuote(tickerNormalized: string): Promise<StockQuote | null> {
  try {
    const result = await yahooFinance.quote(tickerNormalized) as unknown as YahooQuoteResult;
    if (!result || !result.regularMarketPrice) {
      log('warn', `[fetchLatestQuote] No data for ${tickerNormalized}`);
      return null;
    }

    return {
      ticker: tickerNormalized,
      date: new Date().toISOString().split('T')[0],
      open: result.regularMarketOpen || result.regularMarketPrice,
      high: result.regularMarketDayHigh || result.regularMarketPrice,
      low: result.regularMarketDayLow || result.regularMarketPrice,
      close: result.regularMarketPrice,
      volume: result.regularMarketVolume || 0,
      trailingPE: result.trailingPE ?? undefined,
      forwardPE: result.forwardPE ?? undefined,
    };
  } catch (error) {
    log('error', `[fetchLatestQuote] Failed for ${tickerNormalized}: ${error}`);
    return null;
  }
}

/**
 * Fetch historical daily prices for a stock.
 * @param days - Number of trading days to fetch (default 60)
 */
export async function fetchHistoricalPrices(
  tickerNormalized: string,
  days: number = 60
): Promise<StockQuote[]> {
  try {
    const endDate = new Date();
    // Add buffer for weekends/holidays
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.ceil(days * 1.5));

    const result = await yahooFinance.historical(tickerNormalized, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    }) as unknown as YahooHistoricalBar[];

    return result.map((bar: YahooHistoricalBar) => ({
      ticker: tickerNormalized,
      date: bar.date.toISOString().split('T')[0],
      open: bar.open ?? bar.close,
      high: bar.high ?? bar.close,
      low: bar.low ?? bar.close,
      close: bar.close,
      volume: bar.volume ?? 0,
    }));
  } catch (error) {
    log('error', `[fetchHistoricalPrices] Failed for ${tickerNormalized}: ${error}`);
    return [];
  }
}

/**
 * Fetch prices for all active watchlist stocks and store in stock_prices table.
 * @param marketFilter - Optional: only fetch 'US' or 'TW' stocks
 */
export async function fetchAndStorePrices(marketFilter?: 'US' | 'TW'): Promise<{
  fetched: number;
  stored: number;
  failed: number;
  errors: string[];
}> {
  const results = { fetched: 0, stored: 0, failed: 0, errors: [] as string[] };

  // Get active watchlist stocks
  let query = supabaseAdmin
    .from('watchlist_stocks')
    .select('id, ticker_normalized, market, price_at_first_mention')
    .eq('status', 'active');

  if (marketFilter) {
    query = query.eq('market', marketFilter);
  }

  const { data: stocks, error } = await query;

  if (error || !stocks || stocks.length === 0) {
    log('info', `[fetchAndStorePrices] No active stocks to monitor${marketFilter ? ` (market: ${marketFilter})` : ''}`);
    return results;
  }

  log('info', `[fetchAndStorePrices] Fetching prices for ${stocks.length} stocks`);

  for (const stock of stocks) {
    try {
      const quote = await fetchLatestQuote(stock.ticker_normalized);
      if (!quote) {
        results.failed++;
        results.errors.push(`No quote for ${stock.ticker_normalized}`);
        continue;
      }

      results.fetched++;

      // Upsert into stock_prices
      const { error: insertError } = await supabaseAdmin
        .from('stock_prices')
        .upsert({
          ticker_normalized: stock.ticker_normalized,
          price_date: quote.date,
          open_price: quote.open,
          high_price: quote.high,
          low_price: quote.low,
          close_price: quote.close,
          volume: quote.volume,
        }, { onConflict: 'ticker_normalized,price_date' });

      if (insertError) {
        results.errors.push(`Failed to store ${stock.ticker_normalized}: ${insertError.message}`);
        results.failed++;
        continue;
      }

      // Update current_price and PE ratios on watchlist_stocks
      const updateData: Record<string, unknown> = {
        current_price: quote.close,
        last_price_update: new Date().toISOString(),
        trailing_pe: quote.trailingPE ?? null,
        forward_pe: quote.forwardPE ?? null,
      };
      // Set price_at_first_mention if not yet set
      if (stock.price_at_first_mention === undefined || stock.price_at_first_mention === null) {
        updateData.price_at_first_mention = quote.close;
      }
      await supabaseAdmin
        .from('watchlist_stocks')
        .update(updateData)
        .eq('id', stock.id);

      results.stored++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      results.failed++;
      results.errors.push(`Error for ${stock.ticker_normalized}: ${error}`);
    }
  }

  log('info', `[fetchAndStorePrices] Done: ${results.fetched} fetched, ${results.stored} stored, ${results.failed} failed`);
  return results;
}

/**
 * Backfill historical prices for a stock (used when a new stock is added to watchlist).
 */
export async function backfillPrices(tickerNormalized: string, days: number = 60): Promise<number> {
  const history = await fetchHistoricalPrices(tickerNormalized, days);
  if (history.length === 0) return 0;

  let stored = 0;
  for (const bar of history) {
    const { error } = await supabaseAdmin
      .from('stock_prices')
      .upsert({
        ticker_normalized: tickerNormalized,
        price_date: bar.date,
        open_price: bar.open,
        high_price: bar.high,
        low_price: bar.low,
        close_price: bar.close,
        volume: bar.volume,
      }, { onConflict: 'ticker_normalized,price_date' });

    if (!error) stored++;
  }

  log('info', `[backfillPrices] ${tickerNormalized}: stored ${stored}/${history.length} days`);
  return stored;
}

/**
 * Get stored price history from database.
 */
export async function getStoredPrices(
  tickerNormalized: string,
  days: number = 60
): Promise<StockQuote[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.ceil(days * 1.5));

  const { data, error } = await supabaseAdmin
    .from('stock_prices')
    .select('*')
    .eq('ticker_normalized', tickerNormalized)
    .gte('price_date', cutoff.toISOString().split('T')[0])
    .order('price_date', { ascending: true });

  if (error || !data) return [];

  return data.map(row => ({
    ticker: tickerNormalized,
    date: row.price_date,
    open: parseFloat(row.open_price) || parseFloat(row.close_price),
    high: parseFloat(row.high_price) || parseFloat(row.close_price),
    low: parseFloat(row.low_price) || parseFloat(row.close_price),
    close: parseFloat(row.close_price),
    volume: parseInt(row.volume) || 0,
  }));
}
