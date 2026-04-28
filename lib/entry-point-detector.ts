/**
 * Entry Point Detector
 *
 * Detects potential entry points for stocks on the watchlist using
 * rule-based technical analysis. Designed for medium-to-long-term investors.
 *
 * Rules:
 * 1. Significant drop (5%, 10%, 20% from recent highs)
 * 2. RSI oversold (< 30)
 * 3. Consolidation (Bollinger squeeze + narrow range)
 * 4. Near KOL-mentioned support level
 * 5. SMA support (200-day or 50-day pullback)
 */

import { supabaseAdmin } from './supabase';
import { getStoredPrices } from './stock-data';
import {
  computeTechnicalSnapshot,
  isNearSma200Support,
  isPullbackToSma50,
  TechnicalSnapshot,
} from './technical-indicators';
import { log } from './logger';

export type AlertType =
  | 'significant_drop_5pct'
  | 'significant_drop_10pct'
  | 'significant_drop_20pct'
  | 'rsi_oversold'
  | 'consolidation'
  | 'near_kol_support'
  | 'sma_support'
  | 'volume_surge'
  | 'significant_surge_5pct'
  | 'breakout_new_high';

export interface EntrySignal {
  alertType: AlertType;
  triggerPrice: number;
  triggerReason: string;
  technicalSnapshot: TechnicalSnapshot;
  kolContext: Array<{ kol: string; reason: string; date: string }>;
}

export interface DetectionResult {
  ticker: string;
  tickerNormalized: string;
  market: 'US' | 'TW';
  watchlistStockId: number;
  signals: EntrySignal[];
}

interface WatchlistStock {
  id: number;
  ticker: string;
  ticker_normalized: string;
  market: 'US' | 'TW';
  kol_sources: Array<{ kol: string; reason: string; date: string; confidence: string }>;
  kol_price_levels: Array<{ level: number; type: string; kol: string; date: string }>;
  consensus: string;
}

// Cooldown: don't re-alert same stock + type within 72 hours
const ALERT_COOLDOWN_HOURS = 72;

/**
 * Run entry-point detection for all active watchlist stocks.
 * @param marketFilter - Optional: only check 'US' or 'TW' stocks
 */
export async function detectEntryPoints(marketFilter?: 'US' | 'TW'): Promise<DetectionResult[]> {
  let query = supabaseAdmin
    .from('watchlist_stocks')
    .select('*')
    .eq('status', 'active');

  if (marketFilter) {
    query = query.eq('market', marketFilter);
  }

  const { data: stocks, error } = await query;
  if (error || !stocks || stocks.length === 0) {
    log('info', '[detectEntryPoints] No active stocks to check');
    return [];
  }

  const results: DetectionResult[] = [];

  for (const stock of stocks as WatchlistStock[]) {
    try {
      const signals = await checkStock(stock);
      if (signals.length > 0) {
        results.push({
          ticker: stock.ticker,
          tickerNormalized: stock.ticker_normalized,
          market: stock.market as 'US' | 'TW',
          watchlistStockId: stock.id,
          signals,
        });
      }
    } catch (error) {
      log('error', `[detectEntryPoints] Failed for ${stock.ticker}: ${error}`);
    }
  }

  log('info', `[detectEntryPoints] Checked ${stocks.length} stocks, found ${results.length} with signals`);
  return results;
}

async function checkStock(stock: WatchlistStock): Promise<EntrySignal[]> {
  // Get price history (need 252 days for 52-week high, but store what we have)
  const prices = await getStoredPrices(stock.ticker_normalized, 260);
  if (prices.length < 14) {
    log('info', `[checkStock] ${stock.ticker}: insufficient price data (${prices.length} days)`);
    return [];
  }

  const snapshot = computeTechnicalSnapshot(prices);
  if (!snapshot) return [];

  const kolContext = (stock.kol_sources || []).slice(0, 3).map(k => ({
    kol: k.kol,
    reason: k.reason,
    date: k.date,
  }));

  const signals: EntrySignal[] = [];

  // Rule 1: Significant drop from 20-day high
  if (snapshot.dropFrom20dHigh !== null) {
    if (snapshot.dropFrom20dHigh <= -5 && snapshot.dropFrom20dHigh > -10) {
      signals.push({
        alertType: 'significant_drop_5pct',
        triggerPrice: snapshot.currentPrice,
        triggerReason: `從近 20 日高點 ${snapshot.high20d?.toFixed(2)} 回檔 ${Math.abs(snapshot.dropFrom20dHigh).toFixed(1)}%`,
        technicalSnapshot: snapshot,
        kolContext,
      });
    }
    if (snapshot.dropFrom20dHigh <= -10 && snapshot.dropFrom20dHigh > -20) {
      signals.push({
        alertType: 'significant_drop_10pct',
        triggerPrice: snapshot.currentPrice,
        triggerReason: `從近 20 日高點 ${snapshot.high20d?.toFixed(2)} 回檔 ${Math.abs(snapshot.dropFrom20dHigh).toFixed(1)}%，進入修正區間`,
        technicalSnapshot: snapshot,
        kolContext,
      });
    }
  }

  // Rule 1b: Drop from 52-week high (≥ 20%)
  if (snapshot.dropFrom52wHigh !== null && snapshot.dropFrom52wHigh <= -20) {
    signals.push({
      alertType: 'significant_drop_20pct',
      triggerPrice: snapshot.currentPrice,
      triggerReason: `從 52 週高點 ${snapshot.high52w?.toFixed(2)} 回檔 ${Math.abs(snapshot.dropFrom52wHigh).toFixed(1)}%，進入技術性熊市`,
      technicalSnapshot: snapshot,
      kolContext,
    });
  }

  // Rule 2: RSI oversold
  if (snapshot.rsi14 !== null && snapshot.rsi14 < 30) {
    signals.push({
      alertType: 'rsi_oversold',
      triggerPrice: snapshot.currentPrice,
      triggerReason: `RSI(14) = ${snapshot.rsi14.toFixed(1)}，進入超賣區間（< 30）`,
      technicalSnapshot: snapshot,
      kolContext,
    });
  }

  // Rule 3: Consolidation detection
  if (isConsolidating(snapshot)) {
    signals.push({
      alertType: 'consolidation',
      triggerPrice: snapshot.currentPrice,
      triggerReason: `股價進入盤整區間（BB Width 收窄，20 日振幅 ${snapshot.range20d?.toFixed(1)}%），KOL 觀點偏多，留意突破方向`,
      technicalSnapshot: snapshot,
      kolContext,
    });
  }

  // Rule 4: Near KOL-mentioned support level
  const priceLevels = stock.kol_price_levels || [];
  const supportLevels = priceLevels.filter(l => l.type === 'support' || l.type === 'unknown');
  for (const level of supportLevels) {
    if (level.level > 0) {
      const distance = Math.abs((snapshot.currentPrice - level.level) / level.level);
      if (distance <= 0.03) {
        signals.push({
          alertType: 'near_kol_support',
          triggerPrice: snapshot.currentPrice,
          triggerReason: `現價 ${snapshot.currentPrice.toFixed(2)} 接近 ${level.kol} 提到的支撐位 ${level.level}（差距 ${(distance * 100).toFixed(1)}%）`,
          technicalSnapshot: snapshot,
          kolContext,
        });
        break; // Only one support alert per stock per check
      }
    }
  }

  // Rule 5: SMA support
  if (isNearSma200Support(prices, snapshot)) {
    signals.push({
      alertType: 'sma_support',
      triggerPrice: snapshot.currentPrice,
      triggerReason: `股價觸及 SMA(200) ${snapshot.sma200?.toFixed(2)} 後反彈，長線支撐位`,
      technicalSnapshot: snapshot,
      kolContext,
    });
  } else if (isPullbackToSma50(prices, snapshot)) {
    signals.push({
      alertType: 'sma_support',
      triggerPrice: snapshot.currentPrice,
      triggerReason: `股價回測 SMA(50) ${snapshot.sma50?.toFixed(2)}，中線上升趨勢中的拉回`,
      technicalSnapshot: snapshot,
      kolContext,
    });
  }

  // Rule 6: Volume surge (2x 20-day average)
  if (snapshot.avgVolume20d && snapshot.avgVolume20d > 0 && snapshot.volume >= snapshot.avgVolume20d * 2) {
    const ratio = (snapshot.volume / snapshot.avgVolume20d).toFixed(1);
    signals.push({
      alertType: 'volume_surge',
      triggerPrice: snapshot.currentPrice,
      triggerReason: `成交量異常放大（${ratio} 倍於 20 日均量），留意是否有重大消息`,
      technicalSnapshot: snapshot,
      kolContext,
    });
  }

  // Rule 7: Significant surge (single-day +5%)
  if (snapshot.dailyChangePct !== null && snapshot.dailyChangePct >= 5) {
    signals.push({
      alertType: 'significant_surge_5pct',
      triggerPrice: snapshot.currentPrice,
      triggerReason: `單日暴漲 ${snapshot.dailyChangePct.toFixed(1)}%，留意是否有重大利多消息`,
      technicalSnapshot: snapshot,
      kolContext,
    });
  }

  // Rule 8: Breakout new 20-day high (today breaks above, yesterday was below)
  if (snapshot.high20d !== null && prices.length >= 21) {
    const prevCloses = prices.slice(-21, -1).map(p => p.close);
    const prevHigh20d = Math.max(...prevCloses);
    const todayBreaksOut = snapshot.currentPrice >= snapshot.high20d && prices[prices.length - 2].close < prevHigh20d;
    if (todayBreaksOut) {
      signals.push({
        alertType: 'breakout_new_high',
        triggerPrice: snapshot.currentPrice,
        triggerReason: `突破 20 日新高 ${prevHigh20d.toFixed(2)}，趨勢轉強`,
        technicalSnapshot: snapshot,
        kolContext,
      });
    }
  }

  // Filter out signals that were recently sent (72-hour cooldown)
  const filteredSignals = await filterByCooldown(stock.id, signals);

  return filteredSignals;
}

function isConsolidating(snapshot: TechnicalSnapshot): boolean {
  // Need BB data and range data
  if (snapshot.bbWidth === null || snapshot.bbWidthAvg20 === null || snapshot.range20d === null) {
    return false;
  }

  // Condition 1: BB Width is less than 50% of its 20-day average (squeeze)
  const bbSqueeze = snapshot.bbWidth < snapshot.bbWidthAvg20 * 0.5;

  // Condition 2: 20-day price range is less than 8%
  const narrowRange = snapshot.range20d < 8;

  return bbSqueeze && narrowRange;
}

async function filterByCooldown(
  watchlistStockId: number,
  signals: EntrySignal[]
): Promise<EntrySignal[]> {
  if (signals.length === 0) return signals;

  const cooldownCutoff = new Date();
  cooldownCutoff.setHours(cooldownCutoff.getHours() - ALERT_COOLDOWN_HOURS);

  // Get recent alerts for this stock
  const { data: recentAlerts } = await supabaseAdmin
    .from('stock_alerts')
    .select('alert_type')
    .eq('watchlist_stock_id', watchlistStockId)
    .gte('created_at', cooldownCutoff.toISOString())
    .in('status', ['pending', 'sent']);

  if (!recentAlerts || recentAlerts.length === 0) return signals;

  const recentTypes = new Set(recentAlerts.map(a => a.alert_type));
  return signals.filter(s => !recentTypes.has(s.alertType));
}

/**
 * Save detected signals as stock_alerts in the database.
 */
export async function saveAlerts(detectionResults: DetectionResult[]): Promise<number> {
  let savedCount = 0;

  for (const result of detectionResults) {
    for (const signal of result.signals) {
      const { error } = await supabaseAdmin
        .from('stock_alerts')
        .insert({
          watchlist_stock_id: result.watchlistStockId,
          ticker: result.ticker,
          market: result.market,
          alert_type: signal.alertType,
          trigger_price: signal.triggerPrice,
          trigger_reason: signal.triggerReason,
          technical_snapshot: signal.technicalSnapshot,
          kol_context: signal.kolContext,
        });

      if (!error) savedCount++;
    }
  }

  return savedCount;
}
