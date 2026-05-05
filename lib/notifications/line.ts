/**
 * LINE Messaging API Notification Module
 *
 * Sends stock alert notifications via LINE Official Account using Flex Messages.
 * Supports both individual user and group notifications.
 * US and TW stocks are sent as separate carousel messages.
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

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlexComponent = Record<string, any>;

/**
 * Send a LINE push message to a user or group.
 * @param to - User ID (U...) or Group ID (C...)
 */
async function sendLinePushMessage(to: string, messages: FlexComponent[]): Promise<boolean> {
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
      body: JSON.stringify({ to, messages }),
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

function heatColor(rsi: number): string {
  if (rsi < 30) return '#2196F3';
  if (rsi < 40) return '#64B5F6';
  if (rsi < 60) return '#9E9E9E';
  if (rsi < 70) return '#FF9800';
  return '#F44336';
}

function heatLabel(rsi: number): string {
  if (rsi < 30) return '偏冷，可能接近低點';
  if (rsi < 40) return '偏弱，買氣不足';
  if (rsi < 60) return '中性，多空拉鋸';
  if (rsi < 70) return '偏熱，買氣活絡';
  return '過熱，追高風險大';
}

/**
 * Format stock display name.
 */
function formatStockName(result: DetectionResult): string {
  return result.ticker;
}

/**
 * Build a Flex Message bubble for a single stock alert.
 */
function buildAlertBubble(result: DetectionResult): FlexComponent {
  const market = result.market;
  const currency = market === 'TW' ? 'NT$' : '$';
  const marketLabel = market === 'TW' ? '🇹🇼 台股' : '🇺🇸 美股';
  const headerColor = market === 'TW' ? '#1B5E20' : '#0D47A1';

  const snapshot = result.signals[0]?.technicalSnapshot;
  const currentPrice = snapshot?.currentPrice ?? 0;
  const rsi = snapshot?.rsi14 ?? 50;

  // Signal rows
  const signalContents: FlexComponent[] = result.signals.map(signal => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: '📌', size: 'sm', flex: 0 },
      { type: 'text', text: signal.triggerReason, size: 'sm', color: '#555555', wrap: true, flex: 5 },
    ],
  }));

  // Body contents
  const bodyContents: FlexComponent[] = [
    // Price
    {
      type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: '現價', size: 'sm', color: '#999999', flex: 2 },
        { type: 'text', text: `${currency}${currentPrice.toFixed(2)}`, size: 'xl', weight: 'bold', color: '#111111', flex: 5, align: 'end' },
      ],
    },
    { type: 'separator', margin: 'lg' },
    // Heat meter
    {
      type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [
        {
          type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '市場熱度', size: 'sm', color: '#999999', flex: 2 },
            { type: 'text', text: `${rsi.toFixed(0)} / 100`, size: 'sm', weight: 'bold', color: heatColor(rsi), flex: 2, align: 'end' },
          ],
        },
        {
          type: 'box', layout: 'vertical', height: '6px', backgroundColor: '#E0E0E0', cornerRadius: '3px', contents: [
            { type: 'box', layout: 'vertical', contents: [], width: `${Math.min(rsi, 100)}%`, height: '6px', backgroundColor: heatColor(rsi), cornerRadius: '3px' },
          ],
        },
        { type: 'text', text: heatLabel(rsi), size: 'xs', color: '#999999' },
      ],
    },
    { type: 'separator', margin: 'lg' },
    // Signals
    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'md', contents: signalContents },
  ];

  // PE ratio
  const trailingPE = result.trailingPE;
  const forwardPE = result.forwardPE;
  if (trailingPE || forwardPE) {
    bodyContents.push({ type: 'separator', margin: 'lg' });
    const peContents: FlexComponent[] = [];
    if (trailingPE) {
      peContents.push({
        type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '本益比(TTM)', size: 'xs', color: '#999999', flex: 3 },
          { type: 'text', text: trailingPE.toFixed(1), size: 'xs', color: '#555555', flex: 3, align: 'end' },
        ],
      });
    }
    if (forwardPE) {
      peContents.push({
        type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '預估本益比', size: 'xs', color: '#999999', flex: 3 },
          { type: 'text', text: forwardPE.toFixed(1), size: 'xs', color: '#555555', flex: 3, align: 'end' },
        ],
      });
    }
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
      contents: peContents,
    });
  }

  // Reference prices
  const refParts: Array<{ label: string; value: string }> = [];
  if (snapshot?.sma50) refParts.push({ label: '50日均價', value: `${currency}${snapshot.sma50.toFixed(2)}` });
  if (snapshot?.sma200) refParts.push({ label: '200日均價', value: `${currency}${snapshot.sma200.toFixed(2)}` });

  if (refParts.length > 0) {
    bodyContents.push({ type: 'separator', margin: 'lg' });
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
      contents: refParts.map(r => ({
        type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: r.label, size: 'xs', color: '#999999', flex: 3 },
          { type: 'text', text: r.value, size: 'xs', color: '#555555', flex: 3, align: 'end' },
        ],
      })),
    });
  }

  // KOL context
  const kolContext = result.signals[0]?.kolContext || [];
  if (kolContext.length > 0) {
    bodyContents.push({ type: 'separator', margin: 'lg' });
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
      contents: [
        { type: 'text', text: '📣 KOL 觀點', size: 'xs', weight: 'bold', color: '#999999' },
        ...kolContext.slice(0, 2).map(k => {
          const dateSuffix = formatShortDate(k.date);
          return {
            type: 'text', text: `• ${k.kol}${dateSuffix ? `（${dateSuffix}）` : ''}：${k.reason.slice(0, 100)}`, size: 'xs', color: '#555555', wrap: true,
          };
        }),
      ],
    });
  }

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: headerColor, paddingAll: '16px',
      contents: [
        { type: 'text', text: formatStockName(result), size: 'lg', weight: 'bold', color: '#ffffff' },
        { type: 'text', text: marketLabel, size: 'xs', color: '#ffffffcc' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
      contents: bodyContents,
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [
        { type: 'text', text: '⚠️ 僅供教育參考，非投資建議', size: 'xxs', color: '#AAAAAA', align: 'center' },
      ],
    },
  };
}

/**
 * Send stock alert notifications via LINE Flex Messages.
 * US and TW stocks are sent separately.
 * Returns the number of messages sent.
 */
export async function sendLineAlerts(detectionResults: DetectionResult[]): Promise<number> {
  const target = process.env.LINE_GROUP_ID || process.env.LINE_USER_ID;
  if (!target) {
    log('warn', '[LINE] LINE_GROUP_ID and LINE_USER_ID not configured, skipping LINE notifications');
    return 0;
  }

  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    log('warn', '[LINE] LINE_CHANNEL_ACCESS_TOKEN not configured, skipping LINE notifications');
    return 0;
  }

  const usResults = detectionResults.filter(r => r.market === 'US');
  const twResults = detectionResults.filter(r => r.market === 'TW');

  let sentCount = 0;

  // Send US alerts
  if (usResults.length > 0) {
    const bubbles = usResults.map(buildAlertBubble);
    const message: FlexComponent = {
      type: 'flex',
      altText: `📊 美股入場時機提醒（${usResults.length} 檔）`,
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles.slice(0, 12) },
    };

    const success = await sendLinePushMessage(target, [message]);
    if (success) {
      sentCount += usResults.length;
      log('info', `[LINE] Sent ${usResults.length} US stock alerts`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Send TW alerts
  if (twResults.length > 0) {
    const bubbles = twResults.map(buildAlertBubble);
    const message: FlexComponent = {
      type: 'flex',
      altText: `📊 台股入場時機提醒（${twResults.length} 檔）`,
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles.slice(0, 12) },
    };

    const success = await sendLinePushMessage(target, [message]);
    if (success) {
      sentCount += twResults.length;
      log('info', `[LINE] Sent ${twResults.length} TW stock alerts`);
    }
  }

  return sentCount;
}

/**
 * Build a Flex Message bubble for a newly added watchlist stock.
 */
function buildNewStockBubble(stock: NewWatchlistStock): FlexComponent {
  const marketLabel = stock.market === 'TW' ? '🇹🇼 台股' : '🇺🇸 美股';
  const isKol = stock.addedBy === 'pipeline';
  const sourceLabel = isKol ? '🎙️ KOL 推薦' : '🔬 AI 研究';
  const sourceColor = isKol ? '#1565C0' : '#6A1B9A';

  const bodyContents: FlexComponent[] = [
    // Source badge
    {
      type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        {
          type: 'box', layout: 'vertical', cornerRadius: '4px', paddingAll: '4px',
          backgroundColor: sourceColor + '18',
          contents: [
            { type: 'text', text: sourceLabel, size: 'xs', weight: 'bold', color: sourceColor, align: 'center' },
          ],
        },
        { type: 'text', text: marketLabel, size: 'xs', color: '#999999', align: 'end', gravity: 'center' },
      ],
    },
    { type: 'separator', margin: 'lg' },
  ];

  if (isKol) {
    // KOL sources
    const kolRows = stock.kolSources.slice(0, 3).map(k => ({
      type: 'box', layout: 'vertical', spacing: 'xs', contents: [
        { type: 'text', text: `📣 ${k.kol}${formatShortDate(k.date) ? `（${formatShortDate(k.date)}）` : ''}`, size: 'xs', weight: 'bold', color: '#333333' },
        { type: 'text', text: k.reason.slice(0, 120), size: 'xs', color: '#666666', wrap: true },
      ],
    }));
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'lg', spacing: 'md',
      contents: kolRows as FlexComponent[],
    });
  } else {
    // Sector expansion info
    const details: FlexComponent[] = [];
    if (stock.sectorTheme) {
      details.push({
        type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '產業主題', size: 'xs', color: '#999999', flex: 3 },
          { type: 'text', text: stock.sectorTheme, size: 'xs', weight: 'bold', color: '#6A1B9A', flex: 4, align: 'end' },
        ],
      });
    }
    if (stock.kolSources[0]?.reason) {
      details.push({
        type: 'text', text: stock.kolSources[0].reason.slice(0, 120), size: 'xs', color: '#666666', wrap: true, margin: 'sm',
      });
    }
    if (stock.kolSources[0]?.kol) {
      details.push({
        type: 'text', text: `來源 KOL：${stock.kolSources[0].kol}`, size: 'xxs', color: '#AAAAAA', margin: 'sm',
      });
    }
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
      contents: details,
    });
  }

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#F57F17', paddingAll: '16px',
      contents: [
        { type: 'text', text: stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker, size: 'lg', weight: 'bold', color: '#ffffff' },
        { type: 'text', text: '📋 新加入監控', size: 'xs', color: '#ffffffcc' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
      contents: bodyContents,
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [
        { type: 'text', text: '系統將自動監控此股票的入場時機', size: 'xxs', color: '#AAAAAA', align: 'center' },
      ],
    },
  };
}

/**
 * Send LINE notifications for newly added watchlist stocks.
 * US and TW stocks are sent separately.
 */
export async function sendNewStockAlerts(stocks: NewWatchlistStock[]): Promise<number> {
  const target = process.env.LINE_GROUP_ID || process.env.LINE_USER_ID;
  if (!target || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    log('warn', '[LINE] LINE credentials not configured, skipping new stock notifications');
    return 0;
  }

  if (stocks.length === 0) return 0;

  const usStocks = stocks.filter(s => s.market === 'US');
  const twStocks = stocks.filter(s => s.market === 'TW');
  let sentCount = 0;

  if (usStocks.length > 0) {
    const bubbles = usStocks.map(buildNewStockBubble);
    const message: FlexComponent = {
      type: 'flex',
      altText: `📋 新加入監控：美股 ${usStocks.length} 檔`,
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles.slice(0, 12) },
    };
    const success = await sendLinePushMessage(target, [message]);
    if (success) {
      sentCount += usStocks.length;
      log('info', `[LINE] Sent new stock alerts: ${usStocks.length} US stocks`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (twStocks.length > 0) {
    const bubbles = twStocks.map(buildNewStockBubble);
    const message: FlexComponent = {
      type: 'flex',
      altText: `📋 新加入監控：台股 ${twStocks.length} 檔`,
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles.slice(0, 12) },
    };
    const success = await sendLinePushMessage(target, [message]);
    if (success) {
      sentCount += twStocks.length;
      log('info', `[LINE] Sent new stock alerts: ${twStocks.length} TW stocks`);
    }
  }

  return sentCount;
}
