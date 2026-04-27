/**
 * LINE Messaging API Notification Module
 *
 * Sends stock alert notifications via LINE Official Account.
 * Uses the LINE Messaging API push message endpoint.
 */

import { log } from '../logger';
import type { DetectionResult } from '../entry-point-detector';

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

interface LineMessage {
  type: 'text';
  text: string;
}

/**
 * Send a LINE push message to a user or group.
 * @param to - User ID (U...) or Group ID (C...)
 */
async function sendLinePushMessage(to: string, messages: LineMessage[]): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    log('warn', '[LINE] LINE_CHANNEL_ACCESS_TOKEN not configured');
    return false;
  }

  try {
    const response = await fetch(LINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log('error', `[LINE] Push message failed: ${response.status} ${error}`);
      return false;
    }

    return true;
  } catch (error) {
    log('error', `[LINE] Push message error: ${error}`);
    return false;
  }
}

/**
 * Describe RSI in plain language.
 */
function describeRsi(rsi: number): string {
  if (rsi < 30) return `市場熱度：${rsi.toFixed(0)} 分（偏冷，賣壓已釋放大半，可能接近低點）`;
  if (rsi < 40) return `市場熱度：${rsi.toFixed(0)} 分（偏弱，買氣不足）`;
  if (rsi < 60) return `市場熱度：${rsi.toFixed(0)} 分（中性，多空拉鋸）`;
  if (rsi < 70) return `市場熱度：${rsi.toFixed(0)} 分（偏熱，買氣活絡）`;
  return `市場熱度：${rsi.toFixed(0)} 分（過熱，短期追高風險較大）`;
}

/**
 * Format stock display name. Show Chinese name for TW stocks.
 */
function formatStockName(result: DetectionResult): string {
  const marketEmoji = result.market === 'US' ? '🇺🇸' : '🇹🇼';
  // For TW stocks, result.ticker already contains Chinese name like "台積電 (2330)"
  return `${marketEmoji} ${result.ticker}`;
}

/**
 * Format a detection result into a LINE notification message.
 */
function formatAlertMessage(result: DetectionResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`📊 股票觀察提醒：${formatStockName(result)}`);
  lines.push('');

  // Current price
  const snapshot = result.signals[0]?.technicalSnapshot;
  if (snapshot) {
    const currency = result.market === 'TW' ? 'NT$' : '$';
    lines.push(`現價：${currency}${snapshot.currentPrice.toFixed(2)}`);

    // RSI in plain language
    if (snapshot.rsi14 !== null) {
      lines.push(describeRsi(snapshot.rsi14));
    }
  }

  // Signals in plain language
  lines.push('');
  for (const signal of result.signals) {
    lines.push(`📌 ${signal.triggerReason}`);
  }

  // KOL context
  const kolContext = result.signals[0]?.kolContext || [];
  if (kolContext.length > 0) {
    lines.push('');
    lines.push('📣 KOL 觀點：');
    for (const kol of kolContext) {
      lines.push(`• ${kol.kol}（${kol.date}）：${kol.reason.slice(0, 60)}`);
    }
  }

  // Technical summary in plain language
  if (snapshot) {
    lines.push('');
    const currency = result.market === 'TW' ? 'NT$' : '$';
    const techParts: string[] = [];
    if (snapshot.sma50) techParts.push(`50 日均價 ${currency}${snapshot.sma50.toFixed(2)}`);
    if (snapshot.sma200) techParts.push(`200 日均價 ${currency}${snapshot.sma200.toFixed(2)}`);
    if (techParts.length > 0) {
      lines.push(`參考均價：${techParts.join('｜')}`);
    }
  }

  // Disclaimer
  lines.push('');
  lines.push('⚠️ 以上為技術指標與 KOL 公開觀點彙整，僅供教育參考，非投資建議。');

  return lines.join('\n');
}

/**
 * Send stock alert notifications via LINE.
 * Returns the number of messages sent.
 */
export async function sendLineAlerts(detectionResults: DetectionResult[]): Promise<number> {
  // Prefer group, fall back to individual user
  const target = process.env.LINE_GROUP_ID || process.env.LINE_USER_ID;
  if (!target) {
    log('warn', '[LINE] LINE_GROUP_ID and LINE_USER_ID not configured, skipping LINE notifications');
    return 0;
  }

  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    log('warn', '[LINE] LINE_CHANNEL_ACCESS_TOKEN not configured, skipping LINE notifications');
    return 0;
  }

  let sentCount = 0;

  for (const result of detectionResults) {
    const message = formatAlertMessage(result);

    const success = await sendLinePushMessage(target, [
      { type: 'text', text: message },
    ]);

    if (success) {
      sentCount++;
      log('info', `[LINE] Sent alert for ${result.ticker} (${result.signals.length} signals)`);
    }

    // Small delay between messages to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return sentCount;
}
