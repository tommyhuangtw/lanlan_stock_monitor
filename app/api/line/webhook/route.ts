import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

// Alert type display names and scores
const ALERT_TYPE_CONFIG: Record<string, { label: string; score: number }> = {
  significant_drop_20pct: { label: '大幅回檔', score: 30 },
  rsi_oversold: { label: 'RSI 超賣', score: 25 },
  significant_drop_10pct: { label: '回檔 10%', score: 20 },
  near_kol_support: { label: '接近支撐', score: 15 },
  sma_support: { label: '均線支撐', score: 15 },
  significant_drop_5pct: { label: '回檔 5%', score: 10 },
  consolidation: { label: '盤整待突破', score: 10 },
  ai_entry_signal: { label: 'AI 訊號', score: 15 },
};

/**
 * LINE Webhook endpoint.
 * Commands: "groupid", "清單", "追蹤"
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  for (const event of body.events || []) {
    const source = event.source || {};
    console.log('[LINE Webhook]', JSON.stringify({
      type: event.type,
      sourceType: source.type,
      groupId: source.groupId || null,
      userId: source.userId || null,
      timestamp: event.timestamp,
    }));

    if (event.type !== 'message' || !event.message?.text) continue;

    const text = event.message.text.trim().toLowerCase();
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) continue;

    if (text.includes('groupid') && source.type === 'group') {
      await replyMessage(token, event.replyToken, [{
        type: 'text',
        text: `✅ Group ID: ${source.groupId}`,
      }]);
      continue;
    }

    if (text === '清單' || text === '追蹤') {
      const messages = await buildWatchlistReply();
      await replyMessage(token, event.replyToken, messages);
      continue;
    }
  }

  return NextResponse.json({ status: 'ok' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function replyMessage(token: string, replyToken: string, messages: any[]) {
  await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildWatchlistReply(): Promise<any[]> {
  // Fetch stocks and recent alerts in parallel
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
      .select('ticker, alert_type, trigger_reason, technical_snapshot, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const stocks = stocksRes.data || [];
  const alerts = alertsRes.data || [];

  if (stocks.length === 0) {
    return [{ type: 'text', text: '目前沒有追蹤中的股票。' }];
  }

  // Build opportunity scores
  interface ScoredStock {
    ticker: string;
    name: string | null;
    market: string;
    score: number;
    alertLabels: string[];
    rsi: number | null;
    consensus: string | null;
    mentionCount: number;
  }

  const tickerAlerts = new Map<string, typeof alerts>();
  for (const alert of alerts) {
    if (!tickerAlerts.has(alert.ticker)) {
      tickerAlerts.set(alert.ticker, []);
    }
    tickerAlerts.get(alert.ticker)!.push(alert);
  }

  // Set of tickers with recent alerts for the full list marking
  const tickersWithAlerts = new Set(tickerAlerts.keys());

  const scoredStocks: ScoredStock[] = [];

  for (const stock of stocks) {
    const stockAlerts = tickerAlerts.get(stock.ticker) || tickerAlerts.get(stock.ticker_normalized) || [];
    if (stockAlerts.length === 0) continue;

    let score = 0;
    const alertLabels = new Set<string>();

    for (const alert of stockAlerts) {
      const config = ALERT_TYPE_CONFIG[alert.alert_type];
      if (config) {
        // Time decay: newer alerts score higher
        const ageMs = Date.now() - new Date(alert.created_at).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const freshness = Math.max(0, 1 - ageDays / 7);
        score += config.score * (0.5 + 0.5 * freshness);
        alertLabels.add(config.label);
      }
    }

    // Consensus bonus
    if (stock.consensus === '多方共識') score += 20;
    else if (stock.consensus === '單一來源') score += 5;

    // Mention count bonus (capped at 15)
    score += Math.min((stock.mention_count || 1) * 3, 15);

    // Get RSI from most recent alert's technical snapshot
    const latestSnapshot = stockAlerts[0]?.technical_snapshot as { rsi14?: number } | null;
    const rsi = latestSnapshot?.rsi14 ?? null;

    scoredStocks.push({
      ticker: stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker,
      name: stock.name,
      market: stock.market,
      score,
      alertLabels: Array.from(alertLabels),
      rsi,
      consensus: stock.consensus,
      mentionCount: stock.mention_count || 1,
    });
  }

  // Sort by score descending, take top 5
  scoredStocks.sort((a, b) => b.score - a.score);
  const topPicks = scoredStocks.slice(0, 5);

  // === Build Flex Messages ===
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];

  // Bubble 1: Entry opportunities
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opportunityBody: any[] = [];

  if (topPicks.length > 0) {
    for (const pick of topPicks) {
      const marketEmoji = pick.market === 'TW' ? '🇹🇼' : '🇺🇸';
      const tags = pick.alertLabels.join('・');
      const consensusTag = pick.consensus === '多方共識' ? ' 👥' : '';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stockRow: any[] = [
        {
          type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'text', text: `${marketEmoji} ${pick.ticker}`, size: 'sm', weight: 'bold', color: '#333333', flex: 5, wrap: true },
            { type: 'text', text: `${Math.round(pick.score)}分`, size: 'xs', color: '#F57F17', weight: 'bold', flex: 0, align: 'end' },
          ],
        },
        {
          type: 'text', text: `⚡ ${tags}${consensusTag}`, size: 'xs', color: '#666666', margin: 'xs',
        },
      ];

      if (pick.rsi !== null) {
        const rsiColor = pick.rsi < 30 ? '#2196F3' : pick.rsi < 40 ? '#64B5F6' : '#9E9E9E';
        stockRow.push({
          type: 'text', text: `熱度 ${pick.rsi.toFixed(0)}/100`, size: 'xxs', color: rsiColor, margin: 'xs',
        });
      }

      opportunityBody.push({
        type: 'box', layout: 'vertical', spacing: 'none', margin: opportunityBody.length > 0 ? 'lg' : 'none',
        contents: stockRow,
      });
    }
  } else {
    opportunityBody.push({
      type: 'text', text: '目前無明顯入場訊號\n持續監控中...', size: 'sm', color: '#999999', align: 'center', wrap: true,
    });
  }

  messages.push({
    type: 'flex',
    altText: `🎯 入場機會（${topPicks.length} 檔）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#E65100', paddingAll: '16px',
        contents: [
          { type: 'text', text: '🎯 入場機會', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: topPicks.length > 0 ? `近 7 天偵測到 ${topPicks.length} 檔訊號` : '近 7 天無新訊號', size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: opportunityBody,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: '分數越高 = 技術訊號越強 + KOL 共識越高', size: 'xxs', color: '#AAAAAA', align: 'center', wrap: true },
        ],
      },
    },
  });

  // Bubble 2: Full watchlist
  const usStocks = stocks.filter((s: { market: string }) => s.market === 'US');
  const twStocks = stocks.filter((s: { market: string }) => s.market === 'TW');

  const formatStock = (s: { ticker: string; ticker_normalized: string; name: string | null; added_by: string; sector_theme: string | null }) => {
    const icon = s.added_by === 'sector_expansion' ? '🔬' : '🎙️';
    const label = s.name ? `${s.name} (${s.ticker})` : s.ticker;
    const theme = s.sector_theme ? ` [${s.sector_theme}]` : '';
    const alert = (tickersWithAlerts.has(s.ticker) || tickersWithAlerts.has(s.ticker_normalized)) ? ' ⚡' : '';
    return `${icon} ${label}${theme}${alert}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listBody: any[] = [];

  if (usStocks.length > 0) {
    listBody.push(
      { type: 'text', text: `🇺🇸 美股（${usStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#0D47A1' },
      { type: 'text', text: usStocks.map(formatStock).join('\n'), size: 'xs', color: '#555555', wrap: true, margin: 'sm' },
    );
  }

  if (twStocks.length > 0) {
    if (usStocks.length > 0) listBody.push({ type: 'separator', margin: 'lg' });
    listBody.push(
      { type: 'text', text: `🇹🇼 台股（${twStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#1B5E20', margin: usStocks.length > 0 ? 'lg' : 'none' },
      { type: 'text', text: twStocks.map(formatStock).join('\n'), size: 'xs', color: '#555555', wrap: true, margin: 'sm' },
    );
  }

  listBody.push(
    { type: 'separator', margin: 'lg' },
    { type: 'text', text: '🎙️ KOL 推薦　🔬 AI 研究　⚡ 近期有訊號', size: 'xxs', color: '#AAAAAA', margin: 'md', wrap: true },
  );

  messages.push({
    type: 'flex',
    altText: `📋 追蹤清單（${stocks.length} 檔）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#37474F', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📋 完整清單', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: `共 ${stocks.length} 檔監控中`, size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: listBody,
      },
    },
  });

  return messages;
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
