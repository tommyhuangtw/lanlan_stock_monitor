/**
 * Pipeline Step 4.5: Populate Watchlist
 *
 * Extracts bullish stock signals from today's analyses and upserts them
 * into the watchlist_stocks table for price monitoring.
 *
 * This step is NON-BLOCKING: if it fails, the pipeline continues.
 */

import { supabaseAdmin } from '../supabase';
import { normalizeTicker, parsePriceLevels, resolveYahooTicker } from '../ticker-utils';
import { log } from '../logger';
import type { NewWatchlistStock } from '../notifications/telegram';

export interface PopulateWatchlistResult {
  newStocks: number;
  updatedStocks: number;
  skipped: number;
  errors: string[];
  newStockDetails: NewWatchlistStock[];
}

interface KolSource {
  kol: string;
  reason: string;
  date: string;
  confidence: string;
  episodeId?: number;
}

interface KolPriceLevel {
  level: number;
  type: 'support' | 'target' | 'unknown';
  kol: string;
  date: string;
}

export async function populateWatchlist(): Promise<PopulateWatchlistResult> {
  const results: PopulateWatchlistResult = {
    newStocks: 0,
    updatedStocks: 0,
    skipped: 0,
    errors: [],
    newStockDetails: [],
  };

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Get today's digest consolidated report
  const { data: digest, error: digestError } = await supabaseAdmin
    .from('daily_digests')
    .select('consolidated_report')
    .eq('status', 'completed')
    .gte('created_at', `${todayStr}T00:00:00Z`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (digestError || !digest?.consolidated_report) {
    // No digest yet — also try to get from today's analyses directly
    log('info', '[populateWatchlist] No completed digest found today, extracting from analyses directly');
    return await populateFromAnalyses(results, todayStr);
  }

  const report = digest.consolidated_report as {
    bullishSignals?: Array<{
      ticker: string;
      consensus?: string;
      sources?: Array<{ kol: string; reason: string; action: string; confidence: string }>;
      overallConfidence?: string;
      timeHorizon?: string;
      priceLevel?: string;
    }>;
    bearishSignals?: Array<{
      ticker: string;
      sources?: Array<{ kol: string; reason: string; action: string; confidence: string }>;
    }>;
  };

  // Collect bearish tickers for consensus detection
  const bearishTickers = new Set(
    (report.bearishSignals || []).map(s => s.ticker)
  );

  // Process bullish signals
  const bullishSignals = report.bullishSignals || [];
  log('info', `[populateWatchlist] Processing ${bullishSignals.length} bullish signals`);

  for (const signal of bullishSignals) {
    try {
      const normalized = normalizeTicker(signal.ticker);
      if (!normalized) {
        results.skipped++;
        continue;
      }

      const kolSources: KolSource[] = (signal.sources || []).map(s => ({
        kol: s.kol,
        reason: s.reason,
        date: todayStr,
        confidence: s.confidence,
      }));

      const priceLevels: KolPriceLevel[] = signal.priceLevel
        ? parsePriceLevels(signal.priceLevel, kolSources[0]?.kol || 'unknown', todayStr)
        : [];

      // Determine consensus
      const isBearishToo = bearishTickers.has(signal.ticker);
      const consensus = isBearishToo
        ? '觀點分歧'
        : kolSources.length > 1
        ? '多方共識'
        : '單一來源';

      await upsertWatchlistStock({
        ticker: signal.ticker,
        tickerNormalized: normalized.normalized,
        market: normalized.market,
        name: normalized.name || null,
        kolSources,
        consensus,
        priceLevels,
        addedBy: 'pipeline',
      }, results);

    } catch (error) {
      const msg = `Failed to process signal ${signal.ticker}: ${error}`;
      results.errors.push(msg);
      log('error', msg);
    }
  }

  log('info', `[populateWatchlist] Done: ${results.newStocks} new, ${results.updatedStocks} updated, ${results.skipped} skipped`);
  return results;
}

/**
 * Fallback: extract signals directly from analyses table when no consolidated report is available.
 */
async function populateFromAnalyses(
  results: PopulateWatchlistResult,
  todayStr: string
): Promise<PopulateWatchlistResult> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const { data: analyses, error } = await supabaseAdmin
    .from('analyses')
    .select('full_analysis, episodes!inner(title, sources(name))')
    .gte('created_at', cutoff.toISOString());

  if (error || !analyses || analyses.length === 0) {
    log('info', '[populateWatchlist] No recent analyses found');
    return results;
  }

  for (const analysis of analyses) {
    const fullAnalysis = analysis.full_analysis as {
      signals?: Array<{
        type: string;
        ticker: string;
        reason: string;
        confidence: string;
        priceLevel: string;
      }>;
      podcastName?: string;
    } | null;

    if (!fullAnalysis?.signals) continue;

    const bullishSignals = fullAnalysis.signals.filter(s => s.type === 'bullish');
    const podcastName = fullAnalysis.podcastName || 'Unknown';

    for (const signal of bullishSignals) {
      try {
        const normalized = normalizeTicker(signal.ticker);
        if (!normalized) {
          results.skipped++;
          continue;
        }

        const kolSources: KolSource[] = [{
          kol: podcastName,
          reason: signal.reason,
          date: todayStr,
          confidence: signal.confidence,
        }];

        const priceLevels = signal.priceLevel
          ? parsePriceLevels(signal.priceLevel, podcastName, todayStr)
          : [];

        await upsertWatchlistStock({
          ticker: signal.ticker,
          tickerNormalized: normalized.normalized,
          market: normalized.market,
          name: normalized.name || null,
          kolSources,
          consensus: '單一來源',
          priceLevels,
          addedBy: 'pipeline',
        }, results);
      } catch (error) {
        results.errors.push(`Failed to process signal ${signal.ticker}: ${error}`);
      }
    }
  }

  log('info', `[populateWatchlist] From analyses: ${results.newStocks} new, ${results.updatedStocks} updated`);
  return results;
}

async function upsertWatchlistStock(
  params: {
    ticker: string;
    tickerNormalized: string;
    market: 'US' | 'TW';
    name: string | null;
    kolSources: KolSource[];
    consensus: string;
    priceLevels: KolPriceLevel[];
    addedBy: string;
  },
  results: PopulateWatchlistResult
): Promise<void> {
  // Resolve .TW vs .TWO for Taiwan stocks
  params.tickerNormalized = await resolveYahooTicker(params.tickerNormalized);

  // Check if stock already exists
  const { data: existing } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('id, kol_sources, kol_price_levels, mention_count')
    .eq('ticker_normalized', params.tickerNormalized)
    .single();

  if (existing) {
    // Update existing stock
    const existingKols = (existing.kol_sources || []) as KolSource[];
    const existingLevels = (existing.kol_price_levels || []) as KolPriceLevel[];

    // Append new KOL sources (avoid duplicates by kol+date)
    const existingKolKeys = new Set(existingKols.map(k => `${k.kol}|${k.date}`));
    const newKols = params.kolSources.filter(k => !existingKolKeys.has(`${k.kol}|${k.date}`));
    const mergedKols = [...existingKols, ...newKols];

    // Append new price levels
    const existingLevelKeys = new Set(existingLevels.map(l => `${l.level}|${l.kol}`));
    const newLevels = params.priceLevels.filter(l => !existingLevelKeys.has(`${l.level}|${l.kol}`));
    const mergedLevels = [...existingLevels, ...newLevels];

    const { error } = await supabaseAdmin
      .from('watchlist_stocks')
      .update({
        last_mentioned_at: new Date().toISOString(),
        mention_count: (existing.mention_count || 1) + 1,
        kol_sources: mergedKols,
        kol_price_levels: mergedLevels,
        consensus: params.consensus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;
    results.updatedStocks++;
  } else {
    // Insert new stock
    const { error } = await supabaseAdmin
      .from('watchlist_stocks')
      .insert({
        ticker: params.ticker,
        ticker_normalized: params.tickerNormalized,
        market: params.market,
        name: params.name,
        kol_sources: params.kolSources,
        consensus: params.consensus,
        kol_price_levels: params.priceLevels,
        added_by: params.addedBy,
        first_mentioned_at: new Date().toISOString(),
        last_mentioned_at: new Date().toISOString(),
      });

    if (error) throw error;
    results.newStocks++;
    results.newStockDetails.push({
      ticker: params.ticker,
      market: params.market,
      name: params.name,
      addedBy: 'pipeline',
      kolSources: params.kolSources.map(k => ({ kol: k.kol, reason: k.reason, date: k.date })),
    });
  }
}
