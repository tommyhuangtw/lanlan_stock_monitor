/**
 * Shared data-fetching logic for LINE and Telegram webhooks.
 *
 * This module extracts all query / scoring / deduplication logic
 * so that platform-specific formatters only need to turn the
 * structured data into their respective message formats.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { getStoredPrices, fetchValuation, type Valuation } from '@/lib/stock-data';
import { computeTechnicalSnapshot, type TechnicalSnapshot } from '@/lib/technical-indicators';

// ============================================================
// Constants
// ============================================================

export const ALERT_TYPE_CONFIG: Record<string, { label: string; detail: string; score: number }> = {
  significant_drop_20pct: { label: '大幅回檔', detail: '從52週高點回檔逾20%', score: 30 },
  rsi_oversold: { label: 'RSI 超賣', detail: 'RSI < 30，市場可能超賣', score: 25 },
  significant_drop_10pct: { label: '回檔 10%', detail: '從近20日高點回檔逾10%', score: 20 },
  near_kol_support: { label: '接近支撐', detail: '接近 KOL 提及的支撐價位', score: 15 },
  sma_support: { label: '均線支撐', detail: '觸及50日或200日均線後反彈', score: 15 },
  significant_drop_5pct: { label: '回檔 5%', detail: '從近20日高點回檔逾5%', score: 10 },
  consolidation: { label: '盤整待突破', detail: '價格區間收窄，留意突破方向', score: 10 },
  ai_entry_signal: { label: 'AI 訊號', detail: 'AI 偵測到入場機會', score: 15 },
  volume_surge: { label: '量能異常', detail: '成交量異常放大（≥2倍均量）', score: 10 },
  // Emitted by entry-point-detector but previously missing here, so both fell
  // through to a default score of 5 and rendered as raw English in the cards.
  breakout_new_high: { label: '突破新高', detail: '突破近 20 日高點，趨勢轉強', score: 15 },
  significant_surge_5pct: { label: '短線急漲', detail: '短線急漲逾 5%，留意追高風險', score: 5 },
};

/**
 * Mega caps that always head the opportunity list, regardless of signal
 * strength. A deliberate hard tier rather than a score bonus — any bonus big
 * enough to guarantee the top spots would also flatten the ordering below it.
 */
export const MAG7 = new Set(['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA']);

export const SENTIMENT_ICON: Record<string, string> = {
  bullish: '📈',
  bearish: '📉',
  monitor: '👀',
};

export const TICKER_ALIASES: Record<string, string> = {
  // US stocks — common names
  'GOOGLE': 'GOOGL', 'ALPHABET': 'GOOGL',
  'AMAZON': 'AMZN',
  'TESLA': 'TSLA',
  'NVIDIA': 'NVDA', '輝達': 'NVDA',
  'MICROSOFT': 'MSFT', '微軟': 'MSFT',
  'META': 'META', 'FACEBOOK': 'META', 'FB': 'META',
  'NETFLIX': 'NFLX',
  'INTEL': 'INTC',
  'BOEING': 'BA', '波音': 'BA',
  'BROADCOM': 'AVGO', '博通': 'AVGO',
  'MICRON': 'MU', '美光': 'MU',
  'MARVELL': 'MRVL',
  // TW stocks — common names
  'TSMC': '2330.TW', '台積': '2330.TW',
  '聯發科': '2454.TW', 'MEDIATEK': '2454.TW',
  '台達電': '2308.TW', '台達': '2308.TW', 'DELTA': '2308.TW',
  '創意': '3443.TW', '創意電子': '3443.TW',
  '智原': '3035.TW',
  '欣興': '3037.TW', '欣興電子': '3037.TW',
  '奇鋐': '3017.TW',
  '景碩': '3189.TW',
  '八方雲集': '2753.TW', '八方': '2753.TW',
  '聯亞': '3081.TWO',
  '雙鴻': '3324.TWO',
  '鴻海': '2317.TW', 'FOXCONN': '2317.TW',
};

export const FEATURED_KOL_KEYWORDS = new Set([
  '股癌', '財經皓角', '財女珍妮', '韭菜畢業班', '航海王',
]);

export const PRIORITY_KOLS = ['股癌', '游庭皓'];

// ============================================================
// Utility functions
// ============================================================

/** Format "2026-04-18" → " 4/18", empty string if no date */
export function formatShortDate(dateStr: string): string {
  if (!dateStr || dateStr === 'unknown') return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return ` ${d.getMonth() + 1}/${d.getDate()}`;
}

/** Get ISO date string for 2 months ago */
export function twoMonthsAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return d.toISOString();
}

/** Check if a date string is within the last 2 months */
export function isWithinTwoMonths(dateStr: string): boolean {
  if (!dateStr || dateStr === 'unknown') return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  return d >= cutoff;
}

/** Normalize common traditional/simplified Chinese character differences */
export function normalizeChineseChars(text: string): string {
  const map: Record<string, string> = { '臺': '台', '積': '積', '體': '體' };
  return text.replace(/[臺]/g, c => map[c] || c);
}

/** Check whether a watchlist stock row matches a user query */
export function matchesStock(
  s: { ticker: string; ticker_normalized: string; name: string | null; aliases?: string[] | null },
  query: string,
  qUpper: string,
): boolean {
  if (s.ticker_normalized === qUpper) return true;
  if (s.ticker_normalized === `${qUpper}.TW` || s.ticker_normalized === `${qUpper}.TWO`) return true;
  if (s.ticker === query) return true;
  if (s.name) {
    const normName = normalizeChineseChars(s.name).toLowerCase();
    const normQuery = normalizeChineseChars(query).toLowerCase();
    // Require 2+ chars: a 1-char query substring-matches almost every name
    // (e.g. "T" hit Costco). Single-char tickers still resolve via exact match below.
    // ponytail: length guard only; 2-char queries can still be loose (e.g. "ai").
    // Tighten to prefix/word-boundary matching if that shows up in practice.
    if (normQuery.length >= 2 && normName.includes(normQuery)) return true;
  }
  // Exact match on raw ticker (case-insensitive)
  if (s.ticker.toUpperCase() === qUpper) return true;
  if (s.aliases?.length) {
    const qLower = query.toLowerCase();
    if (s.aliases.some(a => a.toLowerCase() === qLower)) return true;
  }
  const aliasTarget = TICKER_ALIASES[qUpper];
  if (aliasTarget && s.ticker_normalized === aliasTarget) return true;
  return false;
}

/**
 * Extract a short, recognizable keyword from a KOL name for the query hint.
 * e.g. "Gooaye 股癌" → "股癌", "NaNa說美股" → "NaNa"
 */
export function extractKolKeyword(name: string): string {
  const map: Record<string, string> = {
    'Gooaye 股癌': '股癌',
    '美股航海王｜指數流': '航海王',
    '韭菜畢業班': '韭菜畢業班',
    '美股投資學-財女珍妮': '財女珍妮',
    '游庭皓的財經皓角': '財經皓角',
    'Nick 美股咖啡館': 'Nick',
    'NaNa說美股': 'NaNa',
    '陽光財經': '陽光財經',
  };
  return map[name] || name;
}

/** Get KOL display priority (lower = higher priority) */
export function kolPriority(kolName: string): number {
  for (let i = 0; i < PRIORITY_KOLS.length; i++) {
    if (kolName.includes(PRIORITY_KOLS[i])) return i;
  }
  return PRIORITY_KOLS.length;
}

// ============================================================
// Shared types
// ============================================================

export interface KolOpinion {
  kol: string;
  sentiment: string;
  reason: string;
  date: string;
}

export interface StockOpinion {
  ticker: string;
  sentiment: string;
  reason: string;
  date: string;
  action?: string;
  confidence?: string;
  timeHorizon?: string;
  priceLevel?: string;
}

/**
 * Bonus added to a stock's signal score so recognisable companies surface
 * first. Sized against ALERT_TYPE_CONFIG (10–30 per signal): a mega cap clears
 * roughly two extra signals on an obscure name, which is what it takes to put
 * META above a small cap that happens to have fired a lot. A genuinely strong
 * small-cap setup still places — it just doesn't lead.
 */
export function familiarityBonus(marketCapUsd: number | null | undefined): number {
  if (!marketCapUsd) return 0;
  if (marketCapUsd >= 200e9) return 60; // mega: NVDA, META, MSFT
  if (marketCapUsd >= 50e9) return 35;  // large: MU, AMD, 台積電
  if (marketCapUsd >= 10e9) return 15;  // mid
  return 0;
}

export interface OpportunityItem {
  ticker: string;
  market: string;
  alertTypes: string[];
  triggerReason: string;
  triggerPrice: number;
  rsi: number | null;
  dropPct: number | null;
  kolName: string;
  kolDate: string;
  score: number;
}

export interface ScoredStock {
  ticker: string;
  market: string;
  score: number;
  alertLabels: string[];
  rsi: number | null;
  consensus: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WatchlistStockRow = Record<string, any>;

export interface Source {
  name: string;
  type: string;
}

export interface StockDetailWatchlist {
  type: 'watchlist';
  stock: WatchlistStockRow;
  snapshot: TechnicalSnapshot | null;
  recentAlertTypes: string[];
  kolOpinions: KolOpinion[];
}

export interface StockDetailAnalyses {
  type: 'analyses';
  query: string;
  opinions: KolOpinion[];
}

export type StockDetailResult = StockDetailWatchlist | StockDetailAnalyses;

// ============================================================
// Data-fetching functions
// ============================================================

/**
 * Fetch scored opportunity items — KOL-backed stocks with recent technical alerts.
 */
export async function fetchOpportunities(market?: 'US' | 'TW'): Promise<{
  opportunities: OpportunityItem[];
  totalStocksScanned: number;
}> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: alerts } = await supabaseAdmin
    .from('stock_alerts')
    .select('ticker, market, alert_type, trigger_reason, trigger_price, technical_snapshot, kol_context, watchlist_stock_id, created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false });

  if (!alerts || alerts.length === 0) {
    return { opportunities: [], totalStocksScanned: 0 };
  }

  // Only stocks still being tracked. Alerts outlive archival, so without this
  // a stock archived today keeps showing up here for another 7 days.
  const stockIds = [...new Set(alerts.map(a => a.watchlist_stock_id))];
  const { data: stocks } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('id, ticker, market, kol_sources, consensus, market_cap_usd')
    .eq('status', 'active')
    .in('id', stockIds);

  const stockMap = new Map((stocks || []).map(s => [s.id, s]));
  const activeAlerts = alerts.filter(a => stockMap.has(a.watchlist_stock_id));

  if (activeAlerts.length === 0) {
    return { opportunities: [], totalStocksScanned: 0 };
  }

  // Deduplicate by ticker, aggregate alert types, pick best info
  const tickerMap = new Map<string, {
    ticker: string; market: string; alertTypes: Set<string>;
    triggerReason: string; triggerPrice: number;
    rsi: number | null; dropPct: number | null;
    kolName: string; kolDate: string; score: number;
  }>();

  for (const alert of activeAlerts) {
    const existing = tickerMap.get(alert.ticker);
    const snapshot = alert.technical_snapshot as { rsi14?: number; dropFrom20dHigh?: number } | null;
     
    const kolCtx = (alert.kol_context as Array<{ kol: string; date: string }>) || [];
    const stock = stockMap.get(alert.watchlist_stock_id);
     
    const kolSources = (stock?.kol_sources as Array<{ kol: string; date: string; confidence: string }>) || [];

    const alertScore = ALERT_TYPE_CONFIG[alert.alert_type]?.score || 5;
    const familiarity = familiarityBonus(stock?.market_cap_usd);
    const kolName = kolCtx[0]?.kol || kolSources[0]?.kol || '';
    const kolDate = kolCtx[0]?.date || kolSources[0]?.date || '';

    if (existing) {
      existing.alertTypes.add(alert.alert_type);
      existing.score += alertScore;
    } else {
      tickerMap.set(alert.ticker, {
        ticker: alert.ticker,
        market: alert.market,
        alertTypes: new Set([alert.alert_type]),
        triggerReason: alert.trigger_reason,
        triggerPrice: alert.trigger_price,
        rsi: snapshot?.rsi14 ?? null,
        dropPct: snapshot?.dropFrom20dHigh ?? null,
        kolName,
        kolDate: kolDate ? formatShortDate(kolDate) : '',
        score: alertScore + familiarity,
      });
    }
  }

  // Filter by market before the slice. Taking the top 8 first and filtering
  // afterwards left /台股機會 empty, because the MAG7 tier fills all 8 slots
  // with US mega caps.
  const opportunities: OpportunityItem[] = [...tickerMap.values()]
    .filter(o => !market || o.market === market)
    .sort((a, b) => {
      const aMag = MAG7.has(a.ticker.toUpperCase()) ? 1 : 0;
      const bMag = MAG7.has(b.ticker.toUpperCase()) ? 1 : 0;
      if (aMag !== bMag) return bMag - aMag;
      return b.score - a.score;
    })
    .slice(0, 8)
    .map(o => ({
      ...o,
      alertTypes: [...o.alertTypes],
    }));

  return { opportunities, totalStocksScanned: stockMap.size };
}

/**
 * Fetch watchlist with scored entry opportunities.
 */
export async function fetchWatchlist(): Promise<{
  scoredStocks: ScoredStock[];
  allStocks: WatchlistStockRow[];
  usStocks: WatchlistStockRow[];
  twStocks: WatchlistStockRow[];
}> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [stocksRes, alertsRes] = await Promise.all([
    supabaseAdmin
      .from('watchlist_stocks')
      .select('ticker, ticker_normalized, market, name, added_by, sector_theme, consensus, mention_count, status')
      .eq('status', 'active')
      .order('market')
      .order('ticker'),
    supabaseAdmin
      .from('stock_alerts')
      .select('ticker, alert_type, technical_snapshot, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const allStocks = stocksRes.data || [];
  const alerts = alertsRes.data || [];

  // Build scored opportunities
  const tickerAlerts = new Map<string, typeof alerts>();
  for (const alert of alerts) {
    if (!tickerAlerts.has(alert.ticker)) tickerAlerts.set(alert.ticker, []);
    tickerAlerts.get(alert.ticker)!.push(alert);
  }

  const scoredStocks: ScoredStock[] = [];
  for (const stock of allStocks) {
    const sa = tickerAlerts.get(stock.ticker) || tickerAlerts.get(stock.ticker_normalized) || [];
    if (sa.length === 0) continue;

    let score = 0;
    const labels = new Set<string>();
    for (const a of sa) {
      const cfg = ALERT_TYPE_CONFIG[a.alert_type];
      if (cfg) {
        const age = (Date.now() - new Date(a.created_at).getTime()) / 86400000;
        score += cfg.score * (0.5 + 0.5 * Math.max(0, 1 - age / 7));
        labels.add(cfg.label);
      }
    }
    // Ranked on entry quality alone. KOL consensus and mention count used to
    // add up to +35 here — comparable to a strong signal — which pushed
    // much-discussed stocks above ones whose technicals had actually reached an
    // entry. Consensus is still returned and shown, it just doesn't rank.

    const snap = sa[0]?.technical_snapshot as { rsi14?: number } | null;
    scoredStocks.push({
      ticker: stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker,
      market: stock.market,
      score,
      alertLabels: Array.from(labels),
      rsi: snap?.rsi14 ?? null,
      consensus: stock.consensus,
    });
  }

  scoredStocks.sort((a, b) => b.score - a.score);

  const usStocks = allStocks.filter((s: WatchlistStockRow) => s.market === 'US');
  const twStocks = allStocks.filter((s: WatchlistStockRow) => s.market === 'TW');

  return { scoredStocks, allStocks, usStocks, twStocks };
}

/**
 * Fetch stock detail — returns watchlist data with technicals, or
 * KOL-only opinions for untracked stocks.
 */
export async function fetchStockDetail(query: string): Promise<StockDetailResult | null> {
  const q = query.toUpperCase().trim();

  // Try watchlist first
  const { data: stocks } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('*')
    .eq('status', 'active');

  const stock = (stocks || []).find(
    (s: { ticker: string; ticker_normalized: string; name: string | null; aliases?: string[] | null }) =>
      matchesStock(s, query, q),
  );

  if (stock) {
    // Compute technical snapshot from stored prices
    const storedPrices = await getStoredPrices(stock.ticker_normalized, 250);
    const snapshot: TechnicalSnapshot | null =
      storedPrices.length >= 14 ? computeTechnicalSnapshot(storedPrices) : null;

    // Recent alert signals (last 7 days)
    const { data: alerts } = await supabaseAdmin
      .from('stock_alerts')
      .select('alert_type')
      .or(`ticker.eq.${stock.ticker},ticker.eq.${stock.ticker_normalized}`)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    const recentAlertTypes = alerts
      ? [...new Set(alerts.map((a: { alert_type: string }) => a.alert_type as string))]
      : [];

    // KOL opinions — deduplicated, priority-sorted, within 2 months
    const kolSources = (
      (stock.kol_sources || []) as Array<{
        kol: string; reason: string; sentiment?: string; date?: string;
      }>
    )
      .filter(k => isWithinTwoMonths(k.date || ''))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const kolMap = new Map<string, KolOpinion>();
    for (const k of kolSources) {
      if (!kolMap.has(k.kol)) {
        kolMap.set(k.kol, {
          kol: k.kol,
          reason: k.reason,
          sentiment: k.sentiment || 'bullish',
          date: k.date || '',
        });
      }
    }

    const kolOpinions = Array.from(kolMap.values())
      .sort((a, b) => kolPriority(a.kol) - kolPriority(b.kol))
      .slice(0, 5);

    return { type: 'watchlist', stock, snapshot, recentAlertTypes, kolOpinions };
  }

  // Fallback: search analyses for KOL mentions
  const opinions = await searchAnalysesForStock(query);
  if (opinions.length > 0) {
    return { type: 'analyses', query, opinions };
  }

  return null;
}

/**
 * Fetch grouped KOL sources.
 */
export async function fetchKolList(): Promise<{
  podcasts: Source[];
  youtubes: Source[];
  total: number;
}> {
  const { data: sources } = await supabaseAdmin
    .from('sources')
    .select('name, type')
    .eq('is_active', true)
    .order('type')
    .order('name');

  if (!sources || sources.length === 0) {
    return { podcasts: [], youtubes: [], total: 0 };
  }

  const podcasts = sources.filter((s: { type: string }) => s.type === 'podcast');
  const youtubes = sources.filter((s: { type: string }) => s.type === 'youtube');

  return { podcasts, youtubes, total: sources.length };
}

/**
 * Fetch categorised KOL opinions from recent analyses.
 */
export async function fetchKolOpinions(kolName: string): Promise<{
  actualKolName: string;
  bullish: StockOpinion[];
  bearish: StockOpinion[];
  monitor: StockOpinion[];
  dateRange: string;
}> {
  const { data: analyses } = await supabaseAdmin
    .from('analyses')
    .select('full_analysis, created_at')
    .gte('created_at', twoMonthsAgoISO())
    .order('created_at', { ascending: false })
    .limit(200);

  const empty = { actualKolName: kolName, bullish: [], bearish: [], monitor: [], dateRange: '' };

  if (!analyses) return empty;

  const bullish: StockOpinion[] = [];
  const bearish: StockOpinion[] = [];
  const monitor: StockOpinion[] = [];
  const seenTickers = new Set<string>();
  const allDates: string[] = [];

  let actualKolName = kolName;

  for (const a of analyses) {
    const fa = a.full_analysis as {
      podcastName?: string;
      signals?: Array<{
        ticker: string; type: string; reason: string;
        action?: string; confidence?: string; timeHorizon?: string; priceLevel?: string;
      }>;
    } | null;
    if (!fa?.signals || !fa.podcastName) continue;
    if (!fa.podcastName.toLowerCase().includes(kolName.toLowerCase())) continue;

    if (actualKolName === kolName) actualKolName = fa.podcastName;

    const date = a.created_at
      ? new Date(a.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
      : '';
    if (date) allDates.push(date);

    for (const sig of fa.signals) {
      if (!sig.ticker || seenTickers.has(`${sig.ticker}|${sig.type}`)) continue;
      seenTickers.add(`${sig.ticker}|${sig.type}`);

      const item: StockOpinion = {
        ticker: sig.ticker,
        sentiment: sig.type,
        reason: sig.reason || '',
        date,
        action: sig.action,
        confidence: sig.confidence,
        timeHorizon: sig.timeHorizon,
        priceLevel: sig.priceLevel,
      };
      if (sig.type === 'bullish') bullish.push(item);
      else if (sig.type === 'bearish') bearish.push(item);
      else monitor.push(item);
    }
  }

  const dateRange =
    allDates.length > 0
      ? `${allDates[allDates.length - 1]} ~ ${allDates[0]}`
      : '近 2 個月';

  return { actualKolName, bullish, bearish, monitor, dateRange };
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Search recent analyses for KOL opinions about a given stock.
 * Used as a fallback when the stock is not on the watchlist.
 */
async function searchAnalysesForStock(query: string): Promise<KolOpinion[]> {
  const q = query.toUpperCase().trim();
  const normQuery = normalizeChineseChars(query).toLowerCase();

  const { data: analyses } = await supabaseAdmin
    .from('analyses')
    .select('full_analysis, created_at')
    .gte('created_at', twoMonthsAgoISO())
    .order('created_at', { ascending: false })
    .limit(100);

  if (!analyses) return [];

  const opinions: KolOpinion[] = [];
  const seen = new Set<string>();

  for (const a of analyses) {
    const fa = a.full_analysis as {
      podcastName?: string;
      signals?: Array<{ ticker: string; type: string; reason: string }>;
    } | null;
    if (!fa?.signals || !fa.podcastName) continue;

    const date = a.created_at ? a.created_at.split('T')[0] : '';

    for (const sig of fa.signals) {
      if (!sig.ticker) continue;
      const ticker = sig.ticker.toUpperCase();
      const normTicker = normalizeChineseChars(sig.ticker).toLowerCase();
      const twNum = q.replace(/\.TWO?$/, '');
      const aliasTarget = TICKER_ALIASES[q];
      // Same guard as matchesStock: substring matching needs 2+ chars, or a
      // 1-char query pulls in every ticker containing that letter.
      const loose = q.length >= 2;
      if (
        ticker !== q &&
        !(loose && ticker.includes(q)) &&
        !(loose && ticker.includes(twNum)) &&
        !(loose && normTicker.includes(normQuery)) &&
        !(aliasTarget && ticker.includes(aliasTarget.replace(/\.TWO?$/, '')))
      ) continue;

      const key = `${fa.podcastName}|${sig.type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      opinions.push({
        kol: fa.podcastName,
        sentiment: sig.type,
        reason: sig.reason || '',
        date,
      });
    }
  }

  return opinions.slice(0, 8);
}

// ============================================================
// Major stocks — quick entry read on the names people actually hold
// ============================================================

/** MAG7 plus TSMC. TSLA is already in MAG7. */
export const MAJOR_TICKERS = ['NVDA', 'META', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'TSLA', '2330.TW'];

export interface MajorStock {
  ticker: string;
  displayName: string;
  market: string;
  price: number | null;
  rsi: number | null;
  sma50: number | null;
  sma200: number | null;
  /** 0–100. Entry attractiveness, not signal count — see entryScore(). */
  score: number;
  valuation: Valuation;
  alertLabels: string[];
  tracked: boolean;
}

/**
 * Entry attractiveness, 0–100. Deliberately not the sum of recent alerts:
 * that measures how much has fired, which rises when a stock runs up. MSFT
 * scored 71 at RSI 77 and +21.5% over its 50-day — the worst moment to buy.
 *
 * Two halves, each 0–50:
 *   technical — cheaper against its own recent range scores higher
 *   valuation — forward P/E, 15 or below full marks, 40 or above nothing
 *
 * The P/E band is calibrated for large-cap tech and semis, which is all this
 * list contains. It would misjudge a utility or a loss-making name, so it
 * stays scoped to the majors rather than being reused across the watchlist.
 *
 * A gauge for ranking a fixed list, not a recommendation.
 */
function entryScore(
  price: number | null,
  rsi: number | null,
  sma50: number | null,
  valuation: Valuation,
): number {
  // Technical: RSI 30 → full marks, RSI 70+ → nothing. Below the 50-day adds,
  // above it subtracts.
  let technical = 25;
  if (rsi !== null) technical = Math.max(0, Math.min(40, ((70 - rsi) / 40) * 40));
  if (price && sma50) {
    const gap = ((price - sma50) / sma50) * 100;
    technical += Math.max(-10, Math.min(10, -gap / 2));
  }
  technical = Math.max(0, Math.min(50, technical));

  // Valuation: linear from 15 (full) to 40 (nothing).
  const pe = valuation.forwardPE;
  const value = pe !== null && pe > 0
    ? Math.max(0, Math.min(50, ((40 - pe) / 25) * 50))
    : 0;

  return Math.round(technical + value);
}

/**
 * Entry read on the majors, in MAJOR_TICKERS order.
 *
 * Ranked by entry attractiveness (see entryScore) — technical position and
 * forward P/E — rather than by how many alerts fired, so a stock that has
 * already run up doesn't rank highest. Recent signals are still shown as
 * context. A stock with no recent signal still appears, because "no setup
 * here" is the answer being asked for.
 */
export async function fetchMajorStocks(): Promise<MajorStock[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: stocks } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('ticker, ticker_normalized, market, name, current_price, status')
    .in('ticker_normalized', MAJOR_TICKERS);

  const { data: alerts } = await supabaseAdmin
    .from('stock_alerts')
    .select('ticker, alert_type, created_at')
    .gte('created_at', sevenDaysAgo.toISOString());

  const alertsByTicker = new Map<string, typeof alerts>();
  for (const a of alerts || []) {
    alertsByTicker.set(a.ticker, [...(alertsByTicker.get(a.ticker) || []), a]);
  }

  const out = (await Promise.all(MAJOR_TICKERS.map(async normalized => {
    const stock = (stocks || []).find(s => s.ticker_normalized === normalized);
    if (!stock) return null;

    const prices = await getStoredPrices(normalized, 250);
    const snapshot = prices.length >= 14 ? computeTechnicalSnapshot(prices) : null;

    const mine = alertsByTicker.get(stock.ticker) || alertsByTicker.get(normalized) || [];
    const labels = new Set<string>();
    for (const a of mine) {
      const cfg = ALERT_TYPE_CONFIG[a.alert_type];
      if (cfg) labels.add(cfg.label);
    }

    const valuation = await fetchValuation(normalized);
    // Live price first: stored prices only refresh for tracked stocks.
    const price = valuation.currentPrice ?? stock.current_price ?? snapshot?.currentPrice ?? null;
    const score = entryScore(price, snapshot?.rsi14 ?? null, snapshot?.sma50 ?? null, valuation);

    return {
      ticker: stock.ticker,
      displayName: stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker,
      market: stock.market,
      price,
      rsi: snapshot?.rsi14 ?? null,
      sma50: snapshot?.sma50 ?? null,
      sma200: snapshot?.sma200 ?? null,
      score,
      valuation,
      alertLabels: [...labels],
      tracked: stock.status === 'active',
    };
  }))).filter((s): s is MajorStock => s !== null);

  return out.sort((a, b) => b.score - a.score);
}
