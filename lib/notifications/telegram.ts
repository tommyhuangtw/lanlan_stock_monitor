/**
 * Telegram Bot API Notification Module
 *
 * Sends stock alert notifications via Telegram Bot API using HTML formatting.
 * Supports both entry-point alerts and new watchlist stock notifications.
 * US and TW stocks are sent as separate message groups.
 */

import { log } from '../logger';
import type { DetectionResult } from '../entry-point-detector';

export interface NewWatchlistStock {
  ticker: string;
  market: 'US' | 'TW';
  name: string | null;
  addedBy: 'pipeline' | 'sector_expansion';
  kolSources: Array<{ kol: string; reason: string; date?: string }>;
  sectorTheme?: string;
}

/**
 * Format a date string to short M/D format.
 */
function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Send a message via Telegram Bot API.
 */
async function sendTelegramMessage(
  chatId: string,
  html: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log('warn', '[Telegram] TELEGRAM_BOT_TOKEN not configured');
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
 * Format an RSI heat bar using emoji segments.
 * Returns a 10-segment bar with a descriptive label.
 */
function formatRsiBar(rsi: number): string {
  const segments = Math.round(rsi / 10);

  let filled: string;
  let label: string;

  if (rsi < 30) {
    filled = '🟦';
    label = '偏冷，可能接近低點';
  } else if (rsi < 40) {
    filled = '🔷';
    label = '偏弱，買氣不足';
  } else if (rsi < 60) {
    filled = '⬛';
    label = '中性，多空拉鋯';
  } else if (rsi < 70) {
    filled = '🟧';
    label = '偏熱，買氣活絡';
  } else {
    filled = '🟥';
    label = '過熱，追高風險大';
  }

  const bar = filled.repeat(segments) + '⬜'.repeat(10 - segments);
  return `${bar} ${label}`;
}

/**
 * Format an alert message for a single stock detection result.
 * Returns an HTML-formatted string for Telegram.
 */
function formatAlertMessage(result: DetectionResult): string {
  const market = result.market;
  const flag = market === 'TW' ? '🇹🇼' : '🇺🇸';
  const currency = market === 'TW' ? 'NT$' : '$';

  const snapshot = result.signals[0]?.technicalSnapshot;
  const currentPrice = snapshot?.currentPrice ?? 0;
  const rsi = snapshot?.rsi14 ?? 50;

  const lines: string[] = [];

  // Header: flag, ticker, price
  lines.push(`${flag} <b>${result.ticker}</b>  ·  ${currency}${currentPrice.toFixed(2)}`);
  lines.push('');

  // Heat meter
  lines.push(`🌡 市場熱度  <b>${rsi.toFixed(0)}</b> / 100`);
  lines.push(formatRsiBar(rsi));
  lines.push('');

  // Signals
  for (const signal of result.signals) {
    lines.push(`📌 ${signal.triggerReason}`);
  }
  lines.push('');

  // PE ratio
  const trailingPE = result.trailingPE;
  const forwardPE = result.forwardPE;
  if (trailingPE || forwardPE) {
    const parts: string[] = [];
    if (trailingPE) parts.push(`本益比(TTM) ${trailingPE.toFixed(1)}`);
    if (forwardPE) parts.push(`預估 ${forwardPE.toFixed(1)}`);
    lines.push(`💰 ${parts.join(' ｜ ')}`);
  }

  // Reference prices (SMA50, SMA200)
  const smaParts: string[] = [];
  if (snapshot?.sma50) smaParts.push(`50日均 ${currency}${snapshot.sma50.toFixed(2)}`);
  if (snapshot?.sma200) smaParts.push(`200日均 ${currency}${snapshot.sma200.toFixed(2)}`);
  if (smaParts.length > 0) {
    lines.push(`📊 ${smaParts.join(' ｜ ')}`);
  }
  lines.push('');

  // KOL context
  const kolContext = result.signals[0]?.kolContext || [];
  if (kolContext.length > 0) {
    lines.push(`📣 <b>KOL 觀點</b>`);
    for (const k of kolContext.slice(0, 2)) {
      const dateSuffix = formatShortDate(k.date);
      const dateLabel = dateSuffix ? `（${dateSuffix}）` : '';
      lines.push(`• <b>${k.kol}</b>${dateLabel}：${k.reason.slice(0, 100)}`);
    }
    lines.push('');
  }

  // Disclaimer
  lines.push(`<i>⚠️ 僅供教育參考，非投資建議</i>`);

  return lines.join('\n');
}

/**
 * Format a new watchlist stock notification message.
 * Returns an HTML-formatted string for Telegram.
 */
function formatNewStockMessage(stock: NewWatchlistStock): string {
  const flag = stock.market === 'TW' ? '🇹🇼' : '🇺🇸';
  const isKol = stock.addedBy === 'pipeline';
  const sourceLabel = isKol ? '🎙️ KOL 推薦' : '🔬 AI 研究';

  const lines: string[] = [];

  // Header
  const displayName = stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker;
  lines.push(`${flag} <b>${displayName}</b>`);
  lines.push(`📋 新加入監控 ｜ ${sourceLabel}`);
  lines.push('');

  if (isKol) {
    // KOL sources
    for (const k of stock.kolSources.slice(0, 3)) {
      const dateSuffix = formatShortDate(k.date);
      const dateLabel = dateSuffix ? `（${dateSuffix}）` : '';
      lines.push(`📣 <b>${k.kol}</b>${dateLabel}`);
      lines.push(`${k.reason.slice(0, 120)}`);
      lines.push('');
    }
  } else {
    // Sector expansion info
    if (stock.sectorTheme) {
      lines.push(`🏷 產業主題：<b>${stock.sectorTheme}</b>`);
    }
    if (stock.kolSources[0]?.reason) {
      lines.push(stock.kolSources[0].reason.slice(0, 120));
    }
    if (stock.kolSources[0]?.kol) {
      lines.push(`來源 KOL：${stock.kolSources[0].kol}`);
    }
    lines.push('');
  }

  lines.push(`<i>系統將自動監控此股票的入場時機</i>`);

  return lines.join('\n');
}

/**
 * Send stock alert notifications via Telegram.
 * US and TW stocks are sent as separate message groups.
 * Returns the number of alerts sent.
 */
export async function sendTelegramAlerts(detectionResults: DetectionResult[]): Promise<number> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    log('warn', '[Telegram] TELEGRAM_CHAT_ID not configured, skipping Telegram notifications');
    return 0;
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    log('warn', '[Telegram] TELEGRAM_BOT_TOKEN not configured, skipping Telegram notifications');
    return 0;
  }

  const usResults = detectionResults.filter(r => r.market === 'US');
  const twResults = detectionResults.filter(r => r.market === 'TW');

  let sentCount = 0;

  // Send US alerts
  if (usResults.length > 0) {
    const headerSent = await sendTelegramMessage(
      chatId,
      `🚨 <b>美股入場時機提醒</b>（${usResults.length} 檔）`
    );
    if (headerSent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    for (const result of usResults) {
      const html = formatAlertMessage(result);
      const success = await sendTelegramMessage(chatId, html);
      if (success) sentCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    log('info', `[Telegram] Sent ${sentCount} US stock alerts`);
  }

  // Send TW alerts
  if (twResults.length > 0) {
    const headerSent = await sendTelegramMessage(
      chatId,
      `🚨 <b>台股入場時機提醒</b>（${twResults.length} 檔）`
    );
    if (headerSent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    let twSentCount = 0;
    for (const result of twResults) {
      const html = formatAlertMessage(result);
      const success = await sendTelegramMessage(chatId, html);
      if (success) twSentCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    sentCount += twSentCount;
    log('info', `[Telegram] Sent ${twSentCount} TW stock alerts`);
  }

  return sentCount;
}

/**
 * Send Telegram notifications for newly added watchlist stocks.
 * US and TW stocks are sent as separate message groups.
 * Returns the number of notifications sent.
 */
export async function sendNewStockTelegramAlerts(stocks: NewWatchlistStock[]): Promise<number> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
    log('warn', '[Telegram] Telegram credentials not configured, skipping new stock notifications');
    return 0;
  }

  if (stocks.length === 0) return 0;

  const usStocks = stocks.filter(s => s.market === 'US');
  const twStocks = stocks.filter(s => s.market === 'TW');
  let sentCount = 0;

  // Send US new stock alerts
  if (usStocks.length > 0) {
    const headerSent = await sendTelegramMessage(
      chatId,
      `📋 <b>新加入監控：美股</b>（${usStocks.length} 檔）`
    );
    if (headerSent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    for (const stock of usStocks) {
      const html = formatNewStockMessage(stock);
      const success = await sendTelegramMessage(chatId, html);
      if (success) sentCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    log('info', `[Telegram] Sent new stock alerts: ${usStocks.length} US stocks`);
  }

  // Send TW new stock alerts
  if (twStocks.length > 0) {
    const headerSent = await sendTelegramMessage(
      chatId,
      `📋 <b>新加入監控：台股</b>（${twStocks.length} 檔）`
    );
    if (headerSent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    let twSentCount = 0;
    for (const stock of twStocks) {
      const html = formatNewStockMessage(stock);
      const success = await sendTelegramMessage(chatId, html);
      if (success) twSentCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    sentCount += twSentCount;
    log('info', `[Telegram] Sent new stock alerts: ${twStocks.length} TW stocks`);
  }

  return sentCount;
}
