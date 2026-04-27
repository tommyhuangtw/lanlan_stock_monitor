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
 * Format a detection result into a LINE notification message.
 */
function formatAlertMessage(result: DetectionResult): string {
  const lines: string[] = [];

  // Header
  const marketEmoji = result.market === 'US' ? '🇺🇸' : '🇹🇼';
  lines.push(`📊 股票觀察提醒：${result.ticker} ${marketEmoji}`);
  lines.push('');

  // Current price and signals
  for (const signal of result.signals) {
    const snapshot = signal.technicalSnapshot;

    lines.push(`現價：${snapshot.currentPrice.toFixed(2)}`);

    if (snapshot.rsi14 !== null) {
      const rsiLabel = snapshot.rsi14 < 30 ? '（偏低）' : snapshot.rsi14 > 70 ? '（偏高）' : '';
      lines.push(`RSI(14)：${snapshot.rsi14.toFixed(1)}${rsiLabel}`);
    }

    lines.push('');
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

  // Technical summary
  const snapshot = result.signals[0]?.technicalSnapshot;
  if (snapshot) {
    lines.push('');
    const techParts: string[] = [];
    if (snapshot.sma50) techParts.push(`SMA50: ${snapshot.sma50.toFixed(2)}`);
    if (snapshot.sma200) techParts.push(`SMA200: ${snapshot.sma200.toFixed(2)}`);
    if (snapshot.bbLower) techParts.push(`BB下緣: ${snapshot.bbLower.toFixed(2)}`);
    if (techParts.length > 0) {
      lines.push(`技術面：${techParts.join(' | ')}`);
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
