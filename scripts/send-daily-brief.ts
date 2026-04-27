/**
 * Daily Brief Push Notification
 *
 * Sends a daily summary to LINE group showing:
 * - Stocks with recent entry signals (last 24h)
 * - Total monitoring stats
 * - Usage hints for interactive commands
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

const ALERT_TYPE_LABELS: Record<string, string> = {
  significant_drop_20pct: '大幅回檔',
  rsi_oversold: 'RSI 超賣',
  significant_drop_10pct: '回檔 10%',
  near_kol_support: '接近支撐',
  sma_support: '均線支撐',
  significant_drop_5pct: '回檔 5%',
  consolidation: '盤整待突破',
  ai_entry_signal: 'AI 訊號',
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
      .select('ticker, alert_type, technical_snapshot, created_at')
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

  // Match alerts to stocks
  interface AlertedStock {
    displayName: string;
    market: string;
    alertLabels: string[];
    rsi: number | null;
    consensus: string | null;
  }

  const alertedStocks: AlertedStock[] = [];
  for (const stock of stocks) {
    const sa = tickerAlerts.get(stock.ticker) || tickerAlerts.get(stock.ticker_normalized) || [];
    if (sa.length === 0) continue;

    const labels = [...new Set(
      sa.map(a => ALERT_TYPE_LABELS[a.alert_type]).filter(Boolean)
    )];

    const snap = sa[0]?.technical_snapshot as { rsi14?: number } | null;

    alertedStocks.push({
      displayName: stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker,
      market: stock.market,
      alertLabels: labels,
      rsi: snap?.rsi14 ?? null,
      consensus: stock.consensus,
    });
  }

  // Sort by number of signal types (more signals = more interesting)
  alertedStocks.sort((a, b) => b.alertLabels.length - a.alertLabels.length);
  const topPicks = alertedStocks.slice(0, 5);

  // Build Flex Message
  const bodyContents: Flex[] = [];

  if (topPicks.length > 0) {
    for (const pick of topPicks) {
      const emoji = pick.market === 'TW' ? '🇹🇼' : '🇺🇸';
      const consensus = pick.consensus === '多方共識' ? ' 👥' : '';

      const row: Flex[] = [
        {
          type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'text', text: `${emoji} ${pick.displayName}`, size: 'sm', weight: 'bold', color: '#333333', flex: 5, wrap: true },
          ],
        },
        { type: 'text', text: `⚡ ${pick.alertLabels.join('・')}${consensus}`, size: 'xs', color: '#E65100', margin: 'xs' },
      ];

      if (pick.rsi !== null) {
        const c = pick.rsi < 30 ? '#2196F3' : pick.rsi < 40 ? '#64B5F6' : '#9E9E9E';
        row.push({ type: 'text', text: `熱度 ${pick.rsi.toFixed(0)}/100`, size: 'xxs', color: c, margin: 'xs' });
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
    ? `近 24 小時偵測到 ${alertedStocks.length} 檔訊號`
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
          { type: 'text', text: '輸入股票代號查詳情 ｜ @KOL 查觀點', size: 'xxs', color: '#AAAAAA', align: 'center', wrap: true },
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
