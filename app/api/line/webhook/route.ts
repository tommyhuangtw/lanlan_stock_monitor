import { NextRequest, NextResponse } from 'next/server';
import {
  ALERT_TYPE_CONFIG,
  SENTIMENT_ICON,
  FEATURED_KOL_KEYWORDS,
  formatShortDate,
  extractKolKeyword,
  fetchOpportunities,
  fetchWatchlist,
  fetchStockDetail,
  fetchKolList,
  fetchKolOpinions,
  fetchMajorStocks,
  type StockOpinion,
  type StockDetailWatchlist,
  type StockDetailAnalyses,
  type WatchlistStockRow,
  type Source,
} from '@/lib/notifications/shared-queries';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = any;

/**
 * LINE Webhook endpoint.
 *
 * This module is a Flex-rendering layer only — all data access lives in
 * lib/notifications/shared-queries.ts, shared with the Telegram webhook so
 * query fixes land on both channels at once.
 *
 * All commands require "/" prefix (except @KOL which uses "@").
 * Messages without a prefix are ignored to avoid false alarms in group chats.
 *
 * Reply messages are free — they don't count toward the LINE message quota.
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

    const rawText = event.message.text.trim();
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) continue;

    // Only respond to "/" or "@" prefixed messages — avoids false alarms in groups
    if (!rawText.startsWith('/') && !rawText.startsWith('@')) continue;

    const cmdText = rawText.startsWith('/') ? rawText.slice(1).trim() : rawText;
    const cmdLower = cmdText.toLowerCase();

    // Command: groupid (admin)
    if (cmdLower === 'groupid' && source.type === 'group') {
      await replyMessage(token, event.replyToken, [{
        type: 'text', text: `✅ Group ID: ${source.groupId}`,
      }]);
      continue;
    }

    // Command: 說明 / help / 指令
    if (cmdLower === '說明' || cmdLower === 'help' || cmdLower === '指令' || cmdLower === 'start') {
      await replyMessage(token, event.replyToken, withQuickReply([buildHelpMessage()], 'help'));
      continue;
    }

    // Command: 清單 / 追蹤
    if (cmdLower === '清單' || cmdLower === '追蹤') {
      await replyMessage(token, event.replyToken, withQuickReply(await buildWatchlistReply(), 'watchlist'));
      continue;
    }

    // Command: kol
    if (cmdLower === 'kol') {
      await replyMessage(token, event.replyToken, withQuickReply(await buildKolListReply(), 'kol'));
      continue;
    }

    // Command: 選單 — a pinnable control panel, so nobody has to recall commands
    if (cmdLower === '選單' || cmdLower === 'menu') {
      await replyMessage(token, event.replyToken, [buildMenuCard()]);
      continue;
    }

    // Command: 機會 / 美股機會 / 台股機會
    if (cmdLower === '機會' || cmdLower === 'opportunity') {
      await replyMessage(token, event.replyToken, withQuickReply(await buildOpportunityReply(), 'opportunity'));
      continue;
    }
    if (cmdLower === '美股機會' || cmdLower === 'us') {
      await replyMessage(token, event.replyToken, withQuickReply(await buildOpportunityReply('US'), 'us'));
      continue;
    }
    if (cmdLower === '台股機會' || cmdLower === 'tw') {
      await replyMessage(token, event.replyToken, withQuickReply(await buildOpportunityReply('TW'), 'tw'));
      continue;
    }

    // Command: 龍頭 — entry read on MAG7 + TSMC
    if (cmdLower === '龍頭' || cmdLower === '大型股' || cmdLower === 'big7') {
      await replyMessage(token, event.replyToken, withQuickReply(await buildMajorsReply(), 'majors'));
      continue;
    }

    // Command: @KOL名稱 (works with both "@股癌" and "/@股癌")
    if (cmdText.startsWith('@') && cmdText.length > 1) {
      const kolName = cmdText.slice(1).trim();
      await replyMessage(token, event.replyToken, withQuickReply(await buildKolReply(kolName)));
      continue;
    }

    // Command: stock ticker lookup (/TSLA, /2330, /台積電, etc.)
    if (cmdText.length > 0 && cmdText.length <= 20) {
      const stockReply = await buildStockReply(cmdText);
      if (stockReply) {
        await replyMessage(token, event.replyToken, withQuickReply(stockReply));
        continue;
      }
      await replyMessage(token, event.replyToken, withQuickReply([{
        type: 'text',
        text: `🔍 找不到「${cmdText}」\n\n輸入 /清單 查看所有追蹤股票\n輸入 /說明 查看指令`,
      }]));
      continue;
    }
  }

  return NextResponse.json({ status: 'ok' });
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

async function replyMessage(token: string, replyToken: string, messages: Msg[]) {
  const res = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    console.error('[LINE Webhook] reply failed:', res.status, await res.text());
  }
}

// ============================================================
// QUICK REPLY — context-aware: the page you're on is omitted
// ============================================================

type NavKey = 'opportunity' | 'us' | 'tw' | 'majors' | 'watchlist' | 'kol' | 'help';

function withQuickReply(messages: Msg[], current?: NavKey): Msg[] {
  if (messages.length === 0) return messages;
  const all: Array<{ key: string; label: string; text: string }> = [
    { key: 'opportunity', label: '🎯 機會', text: '/機會' },
    { key: 'us', label: '🇺🇸 美股', text: '/美股機會' },
    { key: 'tw', label: '🇹🇼 台股', text: '/台股機會' },
    { key: 'majors', label: '👑 龍頭', text: '/龍頭' },
    { key: 'watchlist', label: '📋 清單', text: '/清單' },
    { key: 'kol', label: '📣 KOL', text: '/kol' },
    { key: 'menu', label: '📌 選單', text: '/選單' },
    { key: 'help', label: '❓ 說明', text: '/說明' },
  ];
  const last = messages[messages.length - 1];
  last.quickReply = {
    items: all
      .filter(b => b.key !== current)
      .map(b => ({ type: 'action', action: { type: 'message', label: b.label, text: b.text } })),
  };
  return messages;
}

// ============================================================
// 選單 — pinnable control panel
// ============================================================

/**
 * A Flex card of command buttons, meant to be pinned as the group's 公告.
 *
 * Rich menus can't cover this: they're linked per user ID with no group-level
 * binding, and they don't render on LINE for macOS/Windows at all. Buttons
 * inside a Flex message stay tappable no matter how old the message is, so a
 * pinned card gives the same "never type a command" result on every client.
 */
function buildMenuCard(): Msg {
  const button = (label: string, text: string, color: string) => ({
    type: 'button',
    style: 'primary',
    height: 'sm',
    margin: 'sm',
    color,
    action: { type: 'message', label, text },
  });

  return {
    type: 'flex',
    altText: '📌 懶懶財經選單',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1B5E20', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📌 懶懶財經選單', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: '點按鈕就好，不用記指令', size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: [
          { type: 'text', text: '進場機會', size: 'xs', weight: 'bold', color: '#999999' },
          button('🎯 全部機會', '/機會', '#1B5E20'),
          button('🇺🇸 美股機會', '/美股機會', '#0D47A1'),
          button('🇹🇼 台股機會', '/台股機會', '#2E7D32'),
          button('👑 龍頭股評估', '/龍頭', '#4E342E'),
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: '查詢', size: 'xs', weight: 'bold', color: '#999999', margin: 'lg' },
          button('📋 追蹤清單', '/清單', '#37474F'),
          button('📣 KOL 列表', '/kol', '#4A148C'),
          button('❓ 使用說明', '/說明', '#616161'),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'text', text: '長按這則訊息 →「公告」可釘選在群組上方', size: 'xxs', color: '#AAAAAA', align: 'center', wrap: true },
        ],
      },
    },
  };
}

// ============================================================
// HELP / 說明
// ============================================================

function buildHelpMessage(): Msg {
  return {
    type: 'text',
    text: [
      '👋 歡迎使用懶懶財經 Bot！',
      '',
      '我會自動追蹤 KOL 推薦的股票，',
      '當技術面出現好的進場時機時通知你。',
      '',
      '───────────',
      '🎯 快捷按鈕（點下方按鈕）',
      '───────────',
      '',
      '📌 選單 — 按鈕面板，可長按釘選成群組公告',
      '   釘起來之後就不用再記任何指令',
      '',
      '🎯 機會 — 近期有進場訊號的股票',
      '   依技術面評分排序，Big 7 置頂',
      '   也可只看單一市場：/美股機會、/台股機會',
      '',
      '👑 龍頭 — Big 7 + 台積電的入場分數',
      '   固定這 8 檔，沒訊號也會顯示現況',
      '',
      '📋 清單 — 目前追蹤中的所有股票',
      '   美股 + 台股完整清單',
      '',
      '📣 KOL — 追蹤的 KOL 列表',
      '   點擊 KOL 名稱查看他的觀點',
      '',
      '───────────',
      '🔍 手動查詢（直接輸入）',
      '───────────',
      '',
      '查個股 → 輸入 /TSLA、/2330 或 /台積電',
      '查觀點 → 輸入 @股癌、@NaNa',
      '',
      '───────────',
      '📖 系統如何運作？',
      '───────────',
      '',
      '1️⃣ 每天自動收聽 KOL podcast，提取看多的股票',
      '2️⃣ AI 分析產業趨勢，擴展相關概念股',
      '3️⃣ 持續監控技術面（RSI、均線、跌幅）',
      '4️⃣ 出現進場訊號時推送通知到群組',
      '',
      '入場分數：訊號強度 + KOL 共識度 + 新鮮度',
      'RSI 熱度：0-30 偏冷（低點機會）｜ 30-60 中性 ｜ 60+ 偏熱（追高風險）',
    ].join('\n'),
  };
}

// ============================================================
// KOL LIST
// ============================================================

async function buildKolListReply(): Promise<Msg[]> {
  const { podcasts, youtubes, total } = await fetchKolList();

  if (total === 0) {
    return [{ type: 'text', text: '目前沒有 KOL 資料。' }];
  }

  const body: Msg[] = [];

  const addGroup = (icon: string, label: string, items: Source[]) => {
    if (items.length === 0) return;
    body.push({
      type: 'text', text: `${icon} ${label}`, size: 'sm', weight: 'bold', color: '#333333',
      margin: body.length > 0 ? 'lg' : 'none',
    });
    for (const item of items) {
      const shortName = extractKolKeyword(item.name);
      if (FEATURED_KOL_KEYWORDS.has(shortName)) {
        body.push({
          type: 'button',
          style: 'secondary',
          height: 'sm',
          margin: 'sm',
          action: { type: 'message', label: `📣 ${shortName}`, text: `/@${shortName}` },
        });
      } else {
        body.push({
          type: 'text',
          text: `• ${item.name}  ▸ 輸入 @${shortName}`,
          size: 'xs', color: '#555555', wrap: true, margin: 'sm',
        });
      }
    }
  };

  addGroup('🎙️', 'Podcast', podcasts);
  addGroup('📺', 'YouTube', youtubes);

  return [{
    type: 'flex',
    altText: `📣 KOL 列表（${total} 位）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#4A148C', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📣 KOL 列表', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: `共 ${total} 位 KOL`, size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: body,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: '點按鈕查看觀點，或輸入 @名稱', size: 'xxs', color: '#AAAAAA', align: 'center' },
        ],
      },
    },
  }];
}

// ============================================================
// STOCK LOOKUP
// ============================================================

async function buildStockReply(query: string): Promise<Msg[] | null> {
  const detail = await fetchStockDetail(query);
  if (!detail) return null;
  return detail.type === 'watchlist'
    ? buildWatchlistStockBubble(detail)
    : buildAnalysesStockBubble(detail);
}

function buildWatchlistStockBubble(detail: StockDetailWatchlist): Msg[] {
  const { stock, snapshot, recentAlertTypes, kolOpinions } = detail;
  const market = stock.market;
  const marketLabel = market === 'TW' ? '🇹🇼 台股' : '🇺🇸 美股';
  const headerColor = market === 'TW' ? '#1B5E20' : '#0D47A1';
  const currency = market === 'TW' ? 'NT$' : '$';
  const displayName = stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker;

  const body: Msg[] = [];

  // === Section 1: Price ===
  if (stock.current_price) {
    body.push({
      type: 'text', text: `${currency}${stock.current_price.toFixed(2)}`,
      size: 'xl', weight: 'bold', color: '#111111',
    });
  }

  // === Section 2: Technical indicators ===
  if (snapshot) {
    body.push({ type: 'separator', margin: 'lg' });

    const rsi = snapshot.rsi14;
    if (rsi !== null) {
      const rsiColor = rsi < 30 ? '#2196F3' : rsi < 40 ? '#64B5F6' : rsi < 60 ? '#9E9E9E' : rsi < 70 ? '#FF9800' : '#F44336';
      const rsiLabel = rsi < 30 ? '偏冷' : rsi < 40 ? '偏弱' : rsi < 60 ? '中性' : rsi < 70 ? '偏熱' : '過熱';
      body.push({
        type: 'box', layout: 'horizontal', margin: 'md', contents: [
          { type: 'text', text: `市場熱度 ${rsiLabel}`, size: 'xs', color: '#999999', flex: 3 },
          { type: 'text', text: `${rsi.toFixed(0)} / 100`, size: 'xs', weight: 'bold', color: rsiColor, flex: 2, align: 'end' },
        ],
      });
      body.push({
        type: 'box', layout: 'vertical', height: '4px', backgroundColor: '#E0E0E0', cornerRadius: '2px', margin: 'sm',
        contents: [
          { type: 'box', layout: 'vertical', contents: [], width: `${Math.min(rsi, 100)}%`, height: '4px', backgroundColor: rsiColor, cornerRadius: '2px' },
        ],
      });
    }

    const price = stock.current_price || snapshot.currentPrice;
    const smaRows: Msg[] = [];
    const addSmaRow = (label: string, sma: number, margin?: string) => {
      const diff = price > 0 ? ((price - sma) / sma * 100) : 0;
      const color = diff >= 0 ? '#1B5E20' : '#B71C1C';
      smaRows.push({
        type: 'box', layout: 'horizontal', ...(margin ? { margin } : {}), contents: [
          { type: 'text', text: label, size: 'xs', color: '#999999', flex: 3 },
          { type: 'text', text: `${currency}${sma.toFixed(2)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`, size: 'xs', color, flex: 4, align: 'end' },
        ],
      });
    };
    if (snapshot.sma50) addSmaRow('50日均線', snapshot.sma50);
    if (snapshot.sma200) addSmaRow('200日均線', snapshot.sma200, 'xs');
    if (smaRows.length > 0) {
      body.push({ type: 'box', layout: 'vertical', margin: 'md', contents: smaRows });
    }
  }

  // Recent alert signals — suppress weaker drop tiers when a stronger one fired
  const filteredAlertTypes = recentAlertTypes.filter(t => {
    if (t === 'significant_drop_5pct' && recentAlertTypes.includes('significant_drop_10pct')) return false;
    if (t === 'significant_drop_5pct' && recentAlertTypes.includes('significant_drop_20pct')) return false;
    if (t === 'significant_drop_10pct' && recentAlertTypes.includes('significant_drop_20pct')) return false;
    return true;
  });
  for (const alertType of filteredAlertTypes) {
    const cfg = ALERT_TYPE_CONFIG[alertType];
    if (!cfg) continue;
    body.push({
      type: 'text', text: `⚡ ${cfg.label}：${cfg.detail}`,
      size: 'xs', color: '#E65100', wrap: true, margin: 'sm',
    });
  }

  // === Section 3: KOL opinions ===
  if (kolOpinions.length > 0) {
    body.push({ type: 'separator', margin: 'lg' });
    body.push({ type: 'text', text: 'KOL 觀點', size: 'sm', weight: 'bold', color: '#333333', margin: 'md' });

    for (const k of kolOpinions) {
      const icon = SENTIMENT_ICON[k.sentiment] || '📣';
      const sentLabel = k.sentiment === 'bullish' ? '看多' : k.sentiment === 'bearish' ? '看空' : '觀望';
      const sentColor = k.sentiment === 'bullish' ? '#1B5E20' : k.sentiment === 'bearish' ? '#B71C1C' : '#F57F17';
      const dateStr = formatShortDate(k.date);

      body.push({
        type: 'box', layout: 'horizontal', margin: 'lg', contents: [
          { type: 'text', text: `${icon} ${k.kol}`, size: 'xs', weight: 'bold', color: '#333333', flex: 4 },
          {
            type: 'box', layout: 'vertical', cornerRadius: '4px', paddingAll: '2px',
            backgroundColor: sentColor + '18', flex: 0,
            contents: [
              { type: 'text', text: `${sentLabel}${dateStr}`, size: 'xxs', color: sentColor, align: 'center' },
            ],
          },
        ],
      });
      body.push({
        type: 'text', text: k.reason, size: 'xs', color: '#666666', wrap: true, margin: 'xs',
      });
    }
  }

  if (stock.consensus) {
    body.push({ type: 'separator', margin: 'lg' });
    body.push({
      type: 'text', text: `共識：${stock.consensus}`, size: 'xs', color: '#999999', margin: 'md',
    });
  }

  return [{
    type: 'flex',
    altText: `📊 ${displayName}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: headerColor, paddingAll: '16px',
        contents: [
          { type: 'text', text: displayName, size: 'lg', weight: 'bold', color: '#ffffff', wrap: true },
          { type: 'text', text: marketLabel, size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: body.length > 0 ? body : [{ type: 'text', text: '暫無數據', size: 'sm', color: '#999999' }],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: `${kolOpinions.length} 位 KOL 近期觀點 ｜ /說明 了解更多`, size: 'xxs', color: '#AAAAAA', align: 'center', wrap: true },
        ],
      },
    },
  }];
}

function buildAnalysesStockBubble(detail: StockDetailAnalyses): Msg[] {
  const { query, opinions } = detail;
  const body: Msg[] = [
    { type: 'text', text: '⚠️ 此股票未加入追蹤（無技術指標）', size: 'xs', color: '#FF6F00', wrap: true },
    { type: 'separator', margin: 'lg' },
    { type: 'text', text: 'KOL 觀點', size: 'xs', weight: 'bold', color: '#999999', margin: 'md' },
  ];

  for (const k of opinions.slice(0, 5)) {
    const icon = SENTIMENT_ICON[k.sentiment] || '📣';
    const sentLabel = k.sentiment === 'bullish' ? '看多' : k.sentiment === 'bearish' ? '看空' : '觀望';
    const dateStr = formatShortDate(k.date);
    body.push({
      type: 'text',
      text: `${icon} ${k.kol}(${sentLabel})${dateStr}：${k.reason}`,
      size: 'xs', color: '#555555', wrap: true, margin: 'sm',
    });
  }

  return [{
    type: 'flex',
    altText: `📊 ${query} KOL 觀點`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#78909C', paddingAll: '16px',
        contents: [
          { type: 'text', text: query.toUpperCase(), size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: '未追蹤', size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: body,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: '此股票未被系統自動追蹤', size: 'xxs', color: '#AAAAAA', align: 'center' },
        ],
      },
    },
  }];
}

// ============================================================
// 機會 (OPPORTUNITY) — KOL bullish stocks at attractive levels
// ============================================================

async function buildOpportunityReply(market?: 'US' | 'TW'): Promise<Msg[]> {
  const { opportunities, totalStocksScanned } = await fetchOpportunities(market);
  const scope = market === 'US' ? '🇺🇸 美股' : market === 'TW' ? '🇹🇼 台股' : '';

  if (opportunities.length === 0) {
    return [{
      type: 'text',
      text: market
        ? `🎯 近 7 日${scope}沒有偵測到進場機會。\n\n輸入 /機會 查看全部市場。`
        : '🎯 近 7 日沒有偵測到進場機會。\n\n系統每日掃描追蹤股票的技術訊號（回檔、RSI超賣、均線支撐等），有機會時會自動通知。',
    }];
  }

  const body: Msg[] = [];

  for (const opp of opportunities) {
    const marketFlag = opp.market === 'TW' ? '🇹🇼' : '🇺🇸';
    const kolInfo = opp.kolName ? `${opp.kolName}${opp.kolDate} 看好` : '';

    body.push({
      type: 'text',
      text: `${marketFlag} ${opp.ticker}${kolInfo ? `（${kolInfo}）` : ''}`,
      size: 'sm', weight: 'bold', color: '#333333',
      margin: body.length > 0 ? 'md' : 'none',
    });

    const details: string[] = [];
    if (opp.triggerPrice) details.push(`$${opp.triggerPrice.toFixed(2)}`);
    if (opp.rsi !== null) details.push(`RSI ${opp.rsi.toFixed(0)}`);
    if (opp.dropPct !== null && opp.dropPct < -3) details.push(`${opp.dropPct.toFixed(0)}%`);

    const labels = opp.alertTypes
      .map(t => ALERT_TYPE_CONFIG[t]?.label)
      .filter(Boolean)
      .slice(0, 3);

    body.push({
      type: 'text',
      text: `  ${details.join(' | ')}${labels.length > 0 ? ` • ${labels.join('、')}` : ''}`,
      size: 'xxs', color: '#888888', wrap: true, margin: 'none',
    });
  }

  return [{
    type: 'flex',
    altText: `🎯 ${scope}進場機會（${opportunities.length} 檔）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1B5E20', paddingAll: '16px',
        contents: [
          { type: 'text', text: `🎯 ${scope}進場機會`.trim(), size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: 'KOL 看好 + 技術面訊號', size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: body,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: `近 7 日訊號 | 共掃描 ${totalStocksScanned} 檔追蹤股`, size: 'xxs', color: '#AAAAAA', align: 'center' },
        ],
      },
    },
  }];
}

// ============================================================
// KOL LOOKUP
// ============================================================

async function buildKolReply(kolName: string): Promise<Msg[]> {
  const { actualKolName, bullish, bearish, monitor, dateRange } = await fetchKolOpinions(kolName);

  if (bullish.length === 0 && bearish.length === 0 && monitor.length === 0) {
    return [{ type: 'text', text: `找不到「${kolName}」的觀點資料。\n\n提示：輸入 /kol 查看所有 KOL 列表` }];
  }

  const body: Msg[] = [];
  const confidenceMap: Record<string, string> = { high: '高', medium: '中', low: '低' };
  const timeHorizonMap: Record<string, string> = { short: '短線', medium: '中線', long: '長線' };

  const addSection = (title: string, items: StockOpinion[], color: string) => {
    if (items.length === 0) return;
    body.push({
      type: 'text', text: `${title}（${items.length} 檔）`, size: 'sm', weight: 'bold', color,
      margin: body.length > 0 ? 'lg' : 'none',
    });
    for (const item of items.slice(0, 8)) {
      body.push({
        type: 'text', text: `• ${item.ticker}（${item.date}）：${item.reason}`,
        size: 'xs', color: '#555555', wrap: true, margin: 'xs',
      });
      const details: string[] = [];
      if (item.action) details.push(item.action);
      if (item.confidence) details.push(`信心${confidenceMap[item.confidence] || item.confidence}`);
      if (item.timeHorizon) details.push(timeHorizonMap[item.timeHorizon] || item.timeHorizon);
      if (item.priceLevel) details.push(`目標 ${item.priceLevel}`);
      if (details.length > 0) {
        body.push({
          type: 'text', text: `  ${details.join(' | ')}`, size: 'xxs', color: '#888888', wrap: true, margin: 'none',
        });
      }
    }
    if (items.length > 8) {
      body.push({ type: 'text', text: `...還有 ${items.length - 8} 檔`, size: 'xxs', color: '#AAAAAA', margin: 'xs' });
    }
  };

  addSection('📈 看多', bullish, '#1B5E20');
  addSection('👀 觀望', monitor, '#F57F17');
  addSection('📉 看空', bearish, '#B71C1C');

  return [{
    type: 'flex',
    altText: `📣 ${actualKolName} 近期觀點`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#4A148C', paddingAll: '16px',
        contents: [
          { type: 'text', text: `📣 ${actualKolName}`, size: 'lg', weight: 'bold', color: '#ffffff', wrap: true },
          { type: 'text', text: '近期觀點', size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: body,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: `資料來源：podcast 分析（${dateRange || '近 2 個月'}）`, size: 'xxs', color: '#AAAAAA', align: 'center' },
        ],
      },
    },
  }];
}

// ============================================================
// WATCHLIST
// ============================================================

async function buildWatchlistReply(): Promise<Msg[]> {
  const { scoredStocks, allStocks, usStocks, twStocks } = await fetchWatchlist();

  if (allStocks.length === 0) {
    return [{ type: 'text', text: '目前沒有追蹤中的股票。' }];
  }

  const topPicks = scoredStocks.slice(0, 5);
  const messages: Msg[] = [];

  // Bubble 1: Entry opportunities
  const oppBody: Msg[] = [];
  if (topPicks.length > 0) {
    for (const pick of topPicks) {
      const emoji = pick.market === 'TW' ? '🇹🇼' : '🇺🇸';
      const consensus = pick.consensus === '多方共識' ? ' 👥' : '';
      const row: Msg[] = [
        {
          type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'text', text: `${emoji} ${pick.ticker}`, size: 'sm', weight: 'bold', color: '#333333', flex: 5, wrap: true },
            { type: 'text', text: `${Math.round(pick.score)}分`, size: 'xs', color: '#F57F17', weight: 'bold', flex: 0, align: 'end' },
          ],
        },
        { type: 'text', text: `⚡ ${pick.alertLabels.join('・')}${consensus}`, size: 'xs', color: '#666666', margin: 'xs' },
      ];
      if (pick.rsi !== null) {
        const c = pick.rsi < 30 ? '#2196F3' : pick.rsi < 40 ? '#64B5F6' : '#9E9E9E';
        row.push({ type: 'text', text: `熱度 ${pick.rsi.toFixed(0)}/100`, size: 'xxs', color: c, margin: 'xs' });
      }
      oppBody.push({ type: 'box', layout: 'vertical', spacing: 'none', margin: oppBody.length > 0 ? 'lg' : 'none', contents: row });
    }
  } else {
    oppBody.push({ type: 'text', text: '✅ 目前無明顯入場訊號\n持續監控中...', size: 'sm', color: '#999999', align: 'center', wrap: true });
  }

  messages.push({
    type: 'flex',
    altText: `🎯 入場機會（${topPicks.length} 檔）`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#E65100', paddingAll: '16px',
        contents: [
          { type: 'text', text: '🎯 入場機會', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: topPicks.length > 0 ? `近 7 天偵測到 ${topPicks.length} 檔訊號` : '近 7 天無新訊號', size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm', contents: oppBody },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{ type: 'text', text: '分數越高 = 技術訊號越強 + KOL 共識越高', size: 'xxs', color: '#AAAAAA', align: 'center', wrap: true }],
      },
    },
  });

  // Bubble 2: Full stock list + usage hints
  const formatTicker = (s: WatchlistStockRow) => {
    if (s.market === 'TW' && s.name) return `${s.name}(${s.ticker})`;
    return s.ticker;
  };

  const listBody: Msg[] = [];
  if (usStocks.length > 0) {
    listBody.push({ type: 'text', text: `🇺🇸 美股（${usStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#0D47A1' });
    listBody.push({ type: 'text', text: usStocks.map(formatTicker).join('・'), size: 'xs', color: '#555555', wrap: true, margin: 'sm' });
  }
  if (twStocks.length > 0) {
    listBody.push({ type: 'text', text: `🇹🇼 台股（${twStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#1B5E20', margin: usStocks.length > 0 ? 'lg' : 'none' });
    listBody.push({ type: 'text', text: twStocks.map(formatTicker).join('・'), size: 'xs', color: '#555555', wrap: true, margin: 'sm' });
  }
  listBody.push({ type: 'separator', margin: 'lg' });
  listBody.push({ type: 'text', text: '💡 輸入 /代號 查詳情（如 /TSLA）', size: 'xs', color: '#999999', margin: 'md' });
  listBody.push({ type: 'text', text: '💡 輸入 @名稱 查觀點（如 @股癌）', size: 'xs', color: '#999999', margin: 'xs' });

  messages.push({
    type: 'flex',
    altText: `📋 追蹤清單（${allStocks.length} 檔）`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#37474F', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📋 監控總覽', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: `共 ${allStocks.length} 檔監控中`, size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: listBody,
      },
    },
  });

  return messages;
}

// ============================================================
// 龍頭 — MAG7 + TSMC entry read
// ============================================================

async function buildMajorsReply(): Promise<Msg[]> {
  const majors = await fetchMajorStocks();
  if (majors.length === 0) {
    return [{ type: 'text', text: '👑 目前沒有龍頭股資料。' }];
  }

  const body: Msg[] = [];
  for (const s of majors) {
    const flag = s.market === 'TW' ? '🇹🇼' : '🇺🇸';
    const currency = s.market === 'TW' ? 'NT$' : '$';
    // Score bands, not a pass/fail: the number is a decayed sum of signals, so
    // treat it as "how much has fired lately", not a recommendation.
    const band = s.score >= 60 ? { text: '偏吸引', color: '#1B5E20' }
      : s.score >= 35 ? { text: '中性', color: '#F57F17' }
      : { text: '偏貴', color: '#9E9E9E' };

    body.push({
      type: 'box', layout: 'horizontal', margin: body.length > 0 ? 'lg' : 'none',
      contents: [
        { type: 'text', text: `${flag} ${s.ticker}`, size: 'sm', weight: 'bold', color: '#333333', flex: 5, wrap: true },
        {
          type: 'box', layout: 'vertical', cornerRadius: '4px', paddingAll: '3px', flex: 0,
          backgroundColor: band.color + '1A',
          contents: [{ type: 'text', text: `${Math.round(s.score)} ${band.text}`, size: 'xxs', color: band.color, align: 'center' }],
        },
      ],
    });

    const bits: string[] = [];
    if (s.price) bits.push(`${currency}${s.price.toFixed(2)}`);
    if (s.rsi !== null) bits.push(`RSI ${s.rsi.toFixed(0)}`);
    if (s.sma50 && s.price) {
      const d = ((s.price - s.sma50) / s.sma50) * 100;
      bits.push(`50日均 ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);
    }
    body.push({ type: 'text', text: bits.join('  ｜  '), size: 'xxs', color: '#888888', margin: 'xs' });

    // Analyst consensus — the valuation half of the score
    const val: string[] = [];
    if (s.upsidePct !== null) val.push(`目標價中位數 ${s.upsidePct >= 0 ? '+' : ''}${s.upsidePct.toFixed(0)}%`);
    if (s.analyst.forwardPE) val.push(`預估PE ${s.analyst.forwardPE.toFixed(1)}`);
    if (val.length > 0) {
      const up = (s.upsidePct ?? 0) >= 20 ? '#1B5E20' : (s.upsidePct ?? 0) >= 0 ? '#666666' : '#B71C1C';
      body.push({ type: 'text', text: `🎯 ${val.join('  ｜  ')}`, size: 'xxs', color: up, wrap: true, margin: 'xs' });
    }

    // How much to trust that target: how many analysts, how much they disagree,
    // and how recently any of them actually moved.
    const q: string[] = [];
    if (s.analyst.analystCount > 0) q.push(`${s.analyst.analystCount} 位`);
    if (s.analyst.dispersionPct !== null) {
      const d = s.analyst.dispersionPct;
      q.push(`分歧 ${d.toFixed(0)}%${d > 80 ? '（大）' : d < 40 ? '（小）' : ''}`);
    }
    if (s.analyst.lastRatingDate) {
      const days = Math.round((Date.now() - new Date(s.analyst.lastRatingDate).getTime()) / 86400000);
      q.push(`最新評等 ${s.analyst.lastRatingDate}${days > 180 ? ' ⚠️過舊' : ''}`);
    }
    if (q.length > 0) {
      body.push({ type: 'text', text: `   ${q.join('  ｜  ')}`, size: 'xxs', color: '#AAAAAA', wrap: true });
    }

    if (s.alertLabels.length > 0) {
      body.push({ type: 'text', text: `⚡ ${s.alertLabels.slice(0, 4).join('、')}`, size: 'xxs', color: '#E65100', wrap: true, margin: 'xs' });
    }
    if (!s.tracked) {
      body.push({ type: 'text', text: '（目前未在監控池）', size: 'xxs', color: '#BDBDBD', margin: 'xs' });
    }
  }

  return [{
    type: 'flex',
    altText: '👑 龍頭股入場評估',
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#4E342E', paddingAll: '16px',
        contents: [
          { type: 'text', text: '👑 龍頭股入場評估', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: 'Big 7 + 台積電', size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none', contents: body },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{ type: 'text', text: '分數 = 技術位置（RSI、均線）+ 分析師目標價與評等', size: 'xxs', color: '#AAAAAA', align: 'center', wrap: true }],
      },
    },
  }];
}
