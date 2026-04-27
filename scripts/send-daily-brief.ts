/**
 * Daily Brief Push Notification
 *
 * Sends a daily summary to LINE group showing:
 * - Stocks with recent entry signals (last 24h) with detailed reasons
 * - Current price and KOL consensus
 * - Total monitoring stats
 *
 * Run after the daily pipeline or stock monitor:
 *   npx tsx scripts/send-daily-brief.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

// Signal weights for scoring — higher = more actionable
const SIGNAL_WEIGHTS: Record<string, number> = {
  significant_drop_20pct: 50,
  rsi_oversold: 40,
  significant_drop_10pct: 35,
  near_kol_support: 30,
  significant_drop_5pct: 20,
  sma_support: 15,
  consolidation: 5,
  ai_entry_signal: 15,
  volume_surge: 10,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Flex = Record<string, any>;

async function sendPush(messages: Flex[]): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const target = process.env.LINE_GROUP_ID || process.env.LINE_USER_ID;
  if (!token || !target) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID/LINE_USER_ID');
    return false;
  }

  const res = await fetch(LINE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ to: target, messages }),
  });

  if (!res.ok) {
    console.error(`LINE push failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

interface AlertedStock {
  displayName: string;
  market: string;
  currentPrice: number | null;
  score: number;
  primaryReason: string;
  primaryAlertType: string;
  rsi: number | null;
  consensus: string | null;
  kolCount: number;
}

async function main() {
  console.log('Generating daily brief...');

  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  // Fetch active stocks and recent alerts in parallel
  const [stocksRes, alertsRes] = await Promise.all([
    supabase
      .from('watchlist_stocks')
      .select('ticker, ticker_normalized, market, name, consensus, mention_count, status')
      .eq('status', 'active'),
    supabase
      .from('stock_alerts')
      .select('ticker, alert_type, trigger_reason, technical_snapshot, kol_context, created_at')
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const stocks = stocksRes.data || [];
  const alerts = alertsRes.data || [];

  const usCount = stocks.filter(s => s.market === 'US').length;
  const twCount = stocks.filter(s => s.market === 'TW').length;

  // Group alerts by ticker
  const tickerAlerts = new Map<string, typeof alerts>();
  for (const a of alerts) {
    if (!tickerAlerts.has(a.ticker)) tickerAlerts.set(a.ticker, []);
    tickerAlerts.get(a.ticker)!.push(a);
  }

  // Match alerts to stocks and compute scores
  const alertedStocks: AlertedStock[] = [];
  for (const stock of stocks) {
    const sa = tickerAlerts.get(stock.ticker) || tickerAlerts.get(stock.ticker_normalized) || [];
    if (sa.length === 0) continue;

    // Compute weighted score and find highest-priority alert
    let score = 0;
    let bestWeight = -1;
    let primaryReason = '';
    let primaryAlertType = '';

    for (const a of sa) {
      const weight = SIGNAL_WEIGHTS[a.alert_type] || 0;
      score += weight;
      if (weight > bestWeight) {
        bestWeight = weight;
        primaryReason = a.trigger_reason || a.alert_type;
        primaryAlertType = a.alert_type;
      }
    }

    // Bonus for consensus and mention count
    if (stock.consensus === '多方共識') score += 10;
    if ((stock.mention_count || 0) >= 3) score += 5;

    // Extract current price and RSI from the latest alert's technical_snapshot
    const snap = sa[0]?.technical_snapshot as { currentPrice?: number; rsi14?: number } | null;

    // Count unique KOLs from kol_context
    const kolNames = new Set<string>();
    for (const a of sa) {
      const ctx = a.kol_context as Array<{ kol: string }> | null;
      if (ctx) {
        for (const k of ctx) kolNames.add(k.kol);
      }
    }

    alertedStocks.push({
      displayName: stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker,
      market: stock.market,
      currentPrice: snap?.currentPrice ?? null,
      score,
      primaryReason,
      primaryAlertType,
      rsi: snap?.rsi14 ?? null,
      consensus: stock.consensus,
      kolCount: kolNames.size,
    });
  }

  // Sort by score (highest first)
  alertedStocks.sort((a, b) => b.score - a.score);
  const topPicks = alertedStocks.slice(0, 6);

  // Check if all signals are low-value (consolidation/sma only)
  const hasStrongSignal = topPicks.some(p => p.score > 20);

  // Build Flex Message
  const bodyContents: Flex[] = [];

  if (topPicks.length > 0) {
    for (const pick of topPicks) {
      const emoji = pick.market === 'TW' ? '🇹🇼' : '🇺🇸';
      const currency = pick.market === 'TW' ? 'NT$' : '$';

      // Line 1: name + current price
      const priceStr = pick.currentPrice ? `  ${currency}${pick.currentPrice.toFixed(2)}` : '';
      const row: Flex[] = [
        {
          type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'text', text: `${emoji} ${pick.displayName}`, size: 'sm', weight: 'bold', color: '#333333', flex: 5, wrap: true },
            ...(pick.currentPrice ? [{ type: 'text', text: `${currency}${pick.currentPrice.toFixed(2)}`, size: 'xs', color: '#666666', flex: 0, align: 'end' as const }] : []),
          ],
        },
      ];

      // Line 2: trigger reason with color based on alert type
      const reasonColor = pick.primaryAlertType.includes('drop') || pick.primaryAlertType === 'rsi_oversold'
        ? '#E65100'
        : pick.primaryAlertType === 'sma_support' || pick.primaryAlertType === 'near_kol_support'
          ? '#1565C0'
          : '#9E9E9E';
      row.push({
        type: 'text', text: `⚡ ${pick.primaryReason}`,
        size: 'xs', color: reasonColor, wrap: true, margin: 'xs',
      });

      // Line 3 (optional): RSI oversold / KOL count / consensus
      const tags: string[] = [];
      if (pick.rsi !== null && pick.rsi < 30) {
        tags.push(`RSI ${pick.rsi.toFixed(0)} 超賣`);
      }
      if (pick.kolCount > 1) {
        tags.push(`${pick.kolCount}位KOL看多`);
      } else if (pick.consensus === '多方共識') {
        tags.push('多方共識');
      }
      if (tags.length > 0) {
        row.push({
          type: 'text', text: tags.join('・'),
          size: 'xxs', color: '#888888', margin: 'xs',
        });
      }

      bodyContents.push({
        type: 'box', layout: 'vertical', spacing: 'none',
        margin: bodyContents.length > 0 ? 'lg' : 'none',
        contents: row,
      });
    }
  } else {
    bodyContents.push({
      type: 'text',
      text: '✅ 目前持續監控中，無新入場訊號',
      size: 'sm', color: '#999999', align: 'center', wrap: true,
    });
  }

  // Add summary stats
  bodyContents.push({ type: 'separator', margin: 'lg' });
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'md', contents: [
      { type: 'text', text: `🇺🇸 ${usCount} 檔`, size: 'xs', color: '#0D47A1', flex: 1, align: 'center' },
      { type: 'text', text: `🇹🇼 ${twCount} 檔`, size: 'xs', color: '#1B5E20', flex: 1, align: 'center' },
      { type: 'text', text: `共 ${stocks.length} 檔監控`, size: 'xs', color: '#999999', flex: 2, align: 'center' },
    ],
  });

  const today = new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' });
  const subText = topPicks.length > 0
    ? hasStrongSignal
      ? `近 24 小時偵測到 ${alertedStocks.length} 檔訊號`
      : '近 24 小時無強烈訊號，以下為盤整觀察'
    : '近 24 小時無新訊號';

  const message: Flex = {
    type: 'flex',
    altText: `📊 ${today} 市場觀察`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#263238', paddingAll: '16px',
        contents: [
          { type: 'text', text: `📊 ${today} 市場觀察`, size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: subText, size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: bodyContents,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: '輸入 /說明 查看所有指令', size: 'xxs', color: '#AAAAAA', align: 'center', wrap: true },
        ],
      },
    },
  };

  const ok = await sendPush([message]);
  if (ok) {
    console.log(`Daily brief sent! ${topPicks.length} stocks highlighted, ${stocks.length} total monitored.`);
  } else {
    console.error('Failed to send daily brief.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Daily brief error:', err);
  process.exit(1);
});
