/**
 * Telegram Bot API Notification Module
 *
 * Sends stock alert notifications via Telegram Bot API using HTML formatting.
 * Consolidates multiple stocks into single messages for readability.
 */

import { log } from '../logger';
import type { DetectionResult } from '../entry-point-detector';
import { supabaseAdmin } from '../supabase';

export interface NewWatchlistStock {
  ticker: string;
  market: 'US' | 'TW';
  name: string | null;
  addedBy: 'pipeline' | 'sector_expansion';
  kolSources: Array<{ kol: string; reason: string; date?: string }>;
  sectorTheme?: string;
}

export interface CleanupEntry {
  ticker: string;
  reason: string;
}

/**
 * Send a message via Telegram Bot API.
 */
async function sendTelegramMessage(
  chatId: string,
  html: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log('warn', '[Telegram] TELEGRAM_BOT_TOKEN not configured');
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log('error', `[Telegram] sendMessage failed: ${response.status} ${error}`);
      return false;
    }

    return true;
  } catch (error) {
    log('error', `[Telegram] sendMessage error: ${error}`);
    return false;
  }
}

/**
 * Format a compact alert block for a single stock (3-4 lines).
 */
function formatCompactAlert(result: DetectionResult): string {
  const flag = result.market === 'TW' ? '🇹🇼' : '🇺🇸';
  const currency = result.market === 'TW' ? 'NT$' : '$';
  const snapshot = result.signals[0]?.technicalSnapshot;
  const price = snapshot?.currentPrice ?? 0;
  const rsi = snapshot?.rsi14;

  const lines: string[] = [];

  // Line 1: ticker + price + RSI
  const rsiLabel = rsi != null ? `  RSI ${rsi.toFixed(0)}` : '';
  lines.push(`${flag} <b>${result.ticker}</b>  ${currency}${price.toFixed(2)}${rsiLabel}`);

  // Line 2: signals (joined with ·)
  const signalTexts = result.signals.map(s => s.triggerReason).slice(0, 3);
  lines.push(`⚡ ${signalTexts.join(' · ')}`);

  // Line 3: PE + SMA (conditional)
  const parts: string[] = [];
  if (result.trailingPE) {
    let pe = `PE ${result.trailingPE.toFixed(1)}`;
    if (result.forwardPE) pe += `(F ${result.forwardPE.toFixed(1)})`;
    parts.push(`💰 ${pe}`);
  }
  const smaParts: string[] = [];
  if (snapshot?.sma50) smaParts.push(`50日均 ${currency}${snapshot.sma50.toFixed(0)}`);
  if (snapshot?.sma200) smaParts.push(`200日均 ${currency}${snapshot.sma200.toFixed(0)}`);
  if (smaParts.length > 0) parts.push(`📊 ${smaParts.join(' ｜ ')}`);
  if (parts.length > 0) lines.push(parts.join('  '));

  // Line 4: top KOL opinion (if any, 1 only)
  const kolContext = result.signals[0]?.kolContext || [];
  if (kolContext.length > 0) {
    const k = kolContext[0];
    lines.push(`📣 ${k.kol}：${k.reason.slice(0, 40)}`);
  }

  return lines.join('\n');
}

/**
 * Send stock alert notifications via Telegram.
 * Consolidates all stocks into 1-2 messages per market.
 */
export async function sendTelegramAlerts(detectionResults: DetectionResult[]): Promise<number> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
    log('warn', '[Telegram] Telegram credentials not configured, skipping alerts');
    return 0;
  }

  let sentCount = 0;

  for (const market of ['US', 'TW'] as const) {
    const results = detectionResults.filter(r => r.market === market);
    if (results.length === 0) continue;

    const marketLabel = market === 'US' ? '美股' : '台股';

    // Split into batches of 5 stocks per message
    for (let i = 0; i < results.length; i += 5) {
      const batch = results.slice(i, i + 5);
      const isFirst = i === 0;

      const lines: string[] = [];
      if (isFirst) {
        lines.push(`🚨 <b>${marketLabel}入場時機提醒</b>（${results.length} 檔）`);
        lines.push('━━━━━━━━━━━━━━━');
      }

      for (const result of batch) {
        lines.push('');
        lines.push(formatCompactAlert(result));
      }

      lines.push('');
      lines.push('━━━━━━━━━━━━━━━');
      lines.push('<i>⚠️ 僅供教育參考，非投資建議</i>');

      const success = await sendTelegramMessage(chatId, lines.join('\n'));
      if (success) sentCount += batch.length;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    log('info', `[Telegram] Sent ${results.length} ${market} stock alerts`);
  }

  return sentCount;
}

/**
 * Send Telegram notifications for newly added watchlist stocks.
 * Consolidates all stocks into a single message.
 */
export async function sendNewStockTelegramAlerts(stocks: NewWatchlistStock[]): Promise<number> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
    log('warn', '[Telegram] Telegram credentials not configured, skipping new stock notifications');
    return 0;
  }

  if (stocks.length === 0) return 0;

  const lines: string[] = [
    `📋 <b>新加入監控</b>（${stocks.length} 檔）`,
    '━━━━━━━━━━━━━━━',
  ];

  for (const stock of stocks) {
    const flag = stock.market === 'TW' ? '🇹🇼' : '🇺🇸';
    const displayName = stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker;
    const sourceLabel = stock.addedBy === 'pipeline' ? '🎙️ KOL' : '🔬 AI';
    const themeLabel = stock.sectorTheme ? ` · ${stock.sectorTheme}` : '';

    lines.push('');
    lines.push(`${flag} <b>${displayName}</b>  ${sourceLabel}${themeLabel}`);

    // Show top reason
    const topSource = stock.kolSources[0];
    if (topSource) {
      const prefix = stock.addedBy === 'pipeline' ? topSource.kol : '研究';
      lines.push(`   ${prefix}：${topSource.reason.slice(0, 60)}`);
    }
  }

  const success = await sendTelegramMessage(chatId, lines.join('\n'));
  if (success) {
    log('info', `[Telegram] Sent new stock notification: ${stocks.length} stocks`);
    return stocks.length;
  }
  return 0;
}

/**
 * Send cleanup notification showing archived stocks.
 */
export async function sendCleanupNotification(
  entries: CleanupEntry[],
  usCurrent: number,
  twCurrent: number,
): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN || entries.length === 0) return;

  const lines: string[] = [
    `🗑 <b>監控池清理</b>（${entries.length} 檔已移除）`,
    '',
  ];

  for (const e of entries) {
    lines.push(`• ${e.ticker} — ${e.reason}`);
  }

  lines.push('');
  lines.push(`目前監控：🇺🇸 ${usCurrent} 檔  🇹🇼 ${twCurrent} 檔`);

  await sendTelegramMessage(chatId, lines.join('\n'));
}
