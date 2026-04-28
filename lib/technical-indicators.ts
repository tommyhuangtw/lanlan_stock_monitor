/**
 * Technical Indicators Module
 *
 * Computes technical indicators (RSI, SMA, Bollinger Bands, etc.)
 * from price history using the technicalindicators library.
 */

import { RSI, SMA, BollingerBands, ATR } from 'technicalindicators';
import type { StockQuote } from './stock-data';

export interface TechnicalSnapshot {
  currentPrice: number;
  // RSI
  rsi14: number | null;
  // Simple Moving Averages
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  // Bollinger Bands (20, 2σ)
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbWidth: number | null;
  bbWidthAvg20: number | null;
  // Price relative to highs
  high20d: number | null;
  high52w: number | null;
  dropFrom20dHigh: number | null;  // percentage
  dropFrom52wHigh: number | null;  // percentage
  // Range
  range20d: number | null;  // (high - low) / low as percentage
  // Volume
  volume: number;
  avgVolume20d: number | null;
  // ATR
  atr14: number | null;
  // Daily change
  dailyChangePct: number | null;
}

/**
 * Compute full technical snapshot from price history.
 * Requires at least 200+ data points for SMA(200), but will compute what it can.
 */
export function computeTechnicalSnapshot(prices: StockQuote[]): TechnicalSnapshot | null {
  if (prices.length < 14) return null; // Need at least 14 for RSI

  const closes = prices.map(p => p.close);
  const highs = prices.map(p => p.high);
  const lows = prices.map(p => p.low);
  const volumes = prices.map(p => p.volume);
  const currentPrice = closes[closes.length - 1];

  // RSI(14)
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi14 = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

  // SMA(20, 50, 200)
  const sma20Values = closes.length >= 20 ? SMA.calculate({ values: closes, period: 20 }) : [];
  const sma50Values = closes.length >= 50 ? SMA.calculate({ values: closes, period: 50 }) : [];
  const sma200Values = closes.length >= 200 ? SMA.calculate({ values: closes, period: 200 }) : [];

  const sma20 = sma20Values.length > 0 ? sma20Values[sma20Values.length - 1] : null;
  const sma50 = sma50Values.length > 0 ? sma50Values[sma50Values.length - 1] : null;
  const sma200 = sma200Values.length > 0 ? sma200Values[sma200Values.length - 1] : null;

  // Bollinger Bands (20, 2σ)
  const bbValues = closes.length >= 20
    ? BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })
    : [];

  const latestBB = bbValues.length > 0 ? bbValues[bbValues.length - 1] : null;
  const bbUpper = latestBB?.upper ?? null;
  const bbMiddle = latestBB?.middle ?? null;
  const bbLower = latestBB?.lower ?? null;

  // BB Width and its 20-day average
  let bbWidth: number | null = null;
  let bbWidthAvg20: number | null = null;
  if (latestBB && latestBB.middle > 0) {
    bbWidth = (latestBB.upper - latestBB.lower) / latestBB.middle;
    if (bbValues.length >= 20) {
      const recentWidths = bbValues.slice(-20).map(bb =>
        bb.middle > 0 ? (bb.upper - bb.lower) / bb.middle : 0
      );
      bbWidthAvg20 = recentWidths.reduce((a, b) => a + b, 0) / recentWidths.length;
    }
  }

  // 20-day high and 52-week (252 trading days) high
  const recent20 = closes.slice(-20);
  const high20d = recent20.length > 0 ? Math.max(...recent20) : null;
  const recent252 = closes.slice(-252);
  const high52w = recent252.length > 0 ? Math.max(...recent252) : null;

  const dropFrom20dHigh = high20d ? ((currentPrice - high20d) / high20d) * 100 : null;
  const dropFrom52wHigh = high52w ? ((currentPrice - high52w) / high52w) * 100 : null;

  // 20-day price range
  const recentHighs20 = highs.slice(-20);
  const recentLows20 = lows.slice(-20);
  let range20d: number | null = null;
  if (recentHighs20.length >= 20 && recentLows20.length >= 20) {
    const rangeHigh = Math.max(...recentHighs20);
    const rangeLow = Math.min(...recentLows20);
    range20d = rangeLow > 0 ? ((rangeHigh - rangeLow) / rangeLow) * 100 : null;
  }

  // Volume
  const volume = volumes[volumes.length - 1] || 0;
  const recentVolumes20 = volumes.slice(-20);
  const avgVolume20d = recentVolumes20.length >= 20
    ? recentVolumes20.reduce((a, b) => a + b, 0) / recentVolumes20.length
    : null;

  // Daily change (today vs previous close)
  const dailyChangePct = closes.length >= 2
    ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
    : null;

  // ATR(14)
  let atr14: number | null = null;
  if (prices.length >= 15) {
    const atrValues = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });
    atr14 = atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;
  }

  return {
    currentPrice,
    rsi14,
    sma20,
    sma50,
    sma200,
    bbUpper,
    bbMiddle,
    bbLower,
    bbWidth,
    bbWidthAvg20,
    high20d,
    high52w,
    dropFrom20dHigh,
    dropFrom52wHigh,
    range20d,
    volume,
    avgVolume20d,
    atr14,
    dailyChangePct,
  };
}

/**
 * Check if price is near SMA(200) support with a bounce.
 * "Near" means within 3% of SMA(200).
 * "Bounce" means price was below SMA(200) recently but closed above it today.
 */
export function isNearSma200Support(
  prices: StockQuote[],
  snapshot: TechnicalSnapshot
): boolean {
  if (!snapshot.sma200 || prices.length < 3) return false;

  const currentPrice = snapshot.currentPrice;
  const sma200 = snapshot.sma200;
  const proximity = Math.abs((currentPrice - sma200) / sma200);

  // Within 3% of SMA(200)
  if (proximity > 0.03) return false;

  // Check if there was a touch/cross in recent days
  const recentCloses = prices.slice(-5).map(p => p.close);
  const wasBelow = recentCloses.some(c => c < sma200);
  const isAboveNow = currentPrice >= sma200;

  return wasBelow && isAboveNow;
}

/**
 * Check if price pulled back to SMA(50) in an uptrend.
 * Conditions: price above SMA(50), recently touched it from above.
 */
export function isPullbackToSma50(
  prices: StockQuote[],
  snapshot: TechnicalSnapshot
): boolean {
  if (!snapshot.sma50 || prices.length < 5) return false;

  const sma50 = snapshot.sma50;
  const currentPrice = snapshot.currentPrice;

  // Must be above SMA(50) now
  if (currentPrice < sma50) return false;

  // Must have been close to SMA(50) in last 5 days (within 2%)
  const recentLows = prices.slice(-5).map(p => p.low);
  const touchedSma50 = recentLows.some(low => {
    const distance = (low - sma50) / sma50;
    return distance >= -0.02 && distance <= 0.02;
  });

  return touchedSma50;
}
