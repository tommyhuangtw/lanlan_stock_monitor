import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

/**
 * LINE Webhook endpoint.
 * Handles commands:
 * - "groupid" → replies with the group ID
 * - "清單" or "追蹤" → replies with current watchlist
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

    // Command: groupid
    if (text.includes('groupid') && source.type === 'group') {
      await replyMessage(token, event.replyToken, [{
        type: 'text',
        text: `✅ Group ID: ${source.groupId}`,
      }]);
      continue;
    }

    // Command: 清單 / 追蹤
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
  const { data: stocks, error } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('ticker, ticker_normalized, market, name, added_by, sector_theme, status')
    .eq('status', 'active')
    .order('market')
    .order('ticker');

  if (error || !stocks || stocks.length === 0) {
    return [{ type: 'text', text: '目前沒有追蹤中的股票。' }];
  }

  const usStocks = stocks.filter((s: { market: string }) => s.market === 'US');
  const twStocks = stocks.filter((s: { market: string }) => s.market === 'TW');

  const formatStock = (s: { ticker: string; name: string | null; added_by: string; sector_theme: string | null }) => {
    const icon = s.added_by === 'sector_expansion' ? '🔬' : '🎙️';
    const label = s.name ? `${s.name} (${s.ticker})` : s.ticker;
    const theme = s.sector_theme ? ` [${s.sector_theme}]` : '';
    return `${icon} ${label}${theme}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyContents: any[] = [];

  if (usStocks.length > 0) {
    bodyContents.push(
      { type: 'text', text: `🇺🇸 美股（${usStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#0D47A1' },
      { type: 'text', text: usStocks.map(formatStock).join('\n'), size: 'xs', color: '#555555', wrap: true, margin: 'sm' },
    );
  }

  if (twStocks.length > 0) {
    if (usStocks.length > 0) {
      bodyContents.push({ type: 'separator', margin: 'lg' });
    }
    bodyContents.push(
      { type: 'text', text: `🇹🇼 台股（${twStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#1B5E20', margin: usStocks.length > 0 ? 'lg' : 'none' },
      { type: 'text', text: twStocks.map(formatStock).join('\n'), size: 'xs', color: '#555555', wrap: true, margin: 'sm' },
    );
  }

  bodyContents.push(
    { type: 'separator', margin: 'lg' },
    { type: 'text', text: `🎙️ = KOL 推薦　🔬 = AI 研究`, size: 'xxs', color: '#AAAAAA', margin: 'md' },
  );

  return [{
    type: 'flex',
    altText: `📋 追蹤清單（${stocks.length} 檔）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#37474F', paddingAll: '16px',
        contents: [
          { type: 'text', text: `📋 追蹤清單`, size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: `共 ${stocks.length} 檔監控中`, size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: bodyContents,
      },
    },
  }];
}

// LINE also sends GET for webhook URL verification
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
