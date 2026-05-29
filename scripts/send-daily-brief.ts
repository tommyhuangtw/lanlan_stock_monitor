/**
 * Daily Brief Push Notification (Telegram)
 *
 * Sends a daily summary to Telegram group showing:
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

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

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

async function sendTelegram(text: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return false;
  }

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    console.error(`Telegram send failed: ${res.status} ${await res.text()}`);
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

function formatRsiBar(rsi: number): string {
  const filled = Math.round(rsi / 10);
  const empty = 10 - filled;
  let block: string;
  if (rsi < 30) block = '🟦';
  else if (rsi < 70) block = '⬛';
  else block = '🟥';
  return block.repeat(filled) + '⬜'.repeat(empty);
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

    if (stock.consensus === '多方共識') score += 10;
    if ((stock.mention_count || 0) >= 3) score += 5;

    const snap = sa[0]?.technical_snapshot as { currentPrice?: number; rsi14?: number } | null;

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

  const hasStrongSignal = topPicks.some(p => p.score > 20);

  // Build Telegram HTML message
  const today = new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' });
  const subText = topPicks.length > 0
    ? hasStrongSignal
      ? `近 24 小時偵測到 ${alertedStocks.length} 檔訊號`
      : '近 24 小時無強烈訊號，以下為盤整觀察'
    : '近 24 小時無新訊號';

  const lines: string[] = [
    `📊 <b>${today} 市場觀察</b>`,
    subText,
    '',
  ];

  if (topPicks.length > 0) {
    for (const pick of topPicks) {
      const emoji = pick.market === 'TW' ? '🇹🇼' : '🇺🇸';
      const currency = pick.market === 'TW' ? 'NT$' : '$';
      const priceStr = pick.currentPrice ? `  ${currency}${pick.currentPrice.toFixed(2)}` : '';

      lines.push(`${emoji} <b>${pick.displayName}</b>${priceStr}`);
      lines.push(`⚡ ${pick.primaryReason}`);

      // RSI bar if oversold
      if (pick.rsi !== null && pick.rsi < 30) {
        lines.push(`${formatRsiBar(pick.rsi)} RSI ${pick.rsi.toFixed(0)}`);
      }

      // Tags
      const tags: string[] = [];
      if (pick.kolCount > 1) tags.push(`${pick.kolCount}位KOL看多`);
      else if (pick.consensus === '多方共識') tags.push('多方共識');
      if (tags.length > 0) lines.push(tags.join(' · '));

      lines.push('');
    }
  } else {
    lines.push('✅ 目前持續監控中，無新入場訊號');
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━');
  lines.push(`🇺🇸 ${usCount} 檔  🇹🇼 ${twCount} 檔  共 ${stocks.length} 檔監控`);

  const ok = await sendTelegram(lines.join('\n'));
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
