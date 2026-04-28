/**
 * Ticker normalization utilities for Taiwan and US stock markets.
 * Converts display tickers (e.g. "台積電 (2330)") to API-compatible format (e.g. "2330.TW").
 * Supports both listed (.TW) and OTC (.TWO) Taiwan stocks.
 */

import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface NormalizedTicker {
  display: string;       // Original display form: "台積電 (2330)" or "AAPL"
  normalized: string;    // API-compatible: "2330.TW" or "AAPL"
  market: 'US' | 'TW';
  symbol: string;        // Pure symbol: "2330" or "AAPL"
  name?: string;         // Chinese name if available: "台積電"
}

/**
 * Normalize a ticker string from KOL analysis output to a standard format.
 *
 * Supported formats:
 * - "台積電 (2330)" or "台積電（2330）" → TW market
 * - "AAPL" → US market
 * - "2330.TW" → already normalized TW
 */
export function normalizeTicker(ticker: string): NormalizedTicker | null {
  const t = ticker.trim();

  // Already normalized TW format: "2330.TW" or "3324.TWO"
  const twNormMatch = t.match(/^(\d{4,})\.(TW|TWO)$/i);
  if (twNormMatch) {
    return {
      display: t,
      normalized: `${twNormMatch[1]}.${twNormMatch[2].toUpperCase()}`,
      market: 'TW',
      symbol: twNormMatch[1],
    };
  }

  // Taiwan stock: Chinese chars + (4+ digit code) — supports both () and （）
  const twMatch = t.match(/([\u4e00-\u9fff\u3400-\u4dbf]+)\s*[（(](\d{4,})[）)]/);
  if (twMatch) {
    return {
      display: t,
      normalized: `${twMatch[2]}.TW`,
      market: 'TW',
      symbol: twMatch[2],
      name: twMatch[1],
    };
  }

  // US stock: 1-5 uppercase letters
  const usMatch = t.match(/^([A-Z]{1,5})$/);
  if (usMatch) {
    return {
      display: t,
      normalized: t,
      market: 'US',
      symbol: t,
    };
  }

  // Cannot parse — return null instead of throwing
  return null;
}

/**
 * Check if a ticker string is a valid US or TW stock ticker.
 * Mirrors the logic from openrouter.ts isAllowedTicker().
 */
export function isAllowedTicker(ticker: string): boolean {
  const t = ticker.trim();
  // Explicit HK/CN exchange suffixes — blocked
  if (/\.(HK|SH|SZ)$/i.test(t)) return false;
  // Taiwan stocks: Chinese name + (4+ digit code) — allowed
  if (/[\u4e00-\u9fff].*[（(]\d{4,}[）)]/.test(t)) return true;
  // Pure uppercase letters (1-5 chars) = US ticker — allowed
  if (/^[A-Z]{1,5}$/.test(t)) return true;
  // Chinese characters without TW-style code = likely CN/HK stock — blocked
  if (/[\u4e00-\u9fff]/.test(t) && !/[（(]\d{4,}[）)]/.test(t)) return false;
  // Already normalized TW format (.TW or .TWO)
  if (/^\d{4,}\.TWO?$/i.test(t)) return true;
  // Default: block unknown formats
  return false;
}

/**
 * Extract ticker strings from a priceLevel field.
 * KOLs mention price levels like "目標 250, 支撐 220" — we parse numeric values.
 */
export function parsePriceLevels(priceLevel: string, kol: string, date: string): Array<{
  level: number;
  type: 'support' | 'target' | 'unknown';
  kol: string;
  date: string;
}> {
  if (!priceLevel || priceLevel === 'N/A' || priceLevel === '') return [];

  const levels: Array<{ level: number; type: 'support' | 'target' | 'unknown'; kol: string; date: string }> = [];

  // Match patterns like "目標 250", "支撐 220", "$180", "NT$500"
  const patterns = [
    { regex: /(?:目標|target)[價位]?\s*(?:NT?\$?)?\s*([\d,.]+)/gi, type: 'target' as const },
    { regex: /(?:支撐|support)[價位]?\s*(?:NT?\$?)?\s*([\d,.]+)/gi, type: 'support' as const },
    { regex: /(?:NT?\$|USD?\s*)\s*([\d,.]+)/gi, type: 'unknown' as const },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(priceLevel)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0) {
        levels.push({ level: value, type, kol, date });
      }
    }
  }

  return levels;
}

/** Check if a ticker is a Taiwan stock (.TW or .TWO). */
export function isTWStock(ticker: string): boolean {
  return /\.TWO?$/i.test(ticker);
}

/** Extract the numeric part from a TW ticker: "3324.TWO" → "3324" */
export function twTickerNumber(ticker: string): string {
  return ticker.replace(/\.TWO?$/i, '');
}

/**
 * Resolve correct Yahoo Finance suffix for Taiwan stocks (.TW vs .TWO).
 * Uses Yahoo Finance search API to determine if a stock is listed or OTC.
 */
export async function resolveYahooTicker(tickerNormalized: string): Promise<string> {
  if (!tickerNormalized.endsWith('.TW')) return tickerNormalized;

  const num = twTickerNumber(tickerNormalized);
  try {
    const result = await (yf.search(tickerNormalized) as Promise<{ quotes?: Array<{ symbol?: string }> }>);
    const match = result?.quotes?.find(
      q => q.symbol === `${num}.TW` || q.symbol === `${num}.TWO`
    );
    if (match?.symbol) return match.symbol;
  } catch {
    // fallback to original
  }
  return tickerNormalized;
}
