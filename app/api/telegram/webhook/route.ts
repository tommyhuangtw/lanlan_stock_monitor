import { NextRequest, NextResponse } from 'next/server';
import {
  ALERT_TYPE_CONFIG,
  SENTIMENT_ICON,
  FEATURED_KOL_KEYWORDS,
  extractKolKeyword,
  formatShortDate,
  kolPriority,
  fetchOpportunities,
  fetchWatchlist,
  fetchStockDetail,
  fetchKolList,
  fetchKolOpinions,
  type OpportunityItem,
  type ScoredStock,
  type StockOpinion,
  type WatchlistStockRow,
} from '@/lib/notifications/shared-queries';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// ============================================================
// Telegram API helpers
// ============================================================

type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>;

async function sendMessage(
  chatId: string | number,
  html: string,
  replyMarkup?: InlineKeyboard,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (replyMarkup) {
    body.reply_markup = { inline_keyboard: replyMarkup };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[Telegram] sendMessage failed: ${res.status} ${err}`);
    }
    return res.ok;
  } catch (e) {
    console.error(`[Telegram] sendMessage error: ${e}`);
    return false;
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch {
    // non-critical
  }
}

// Quick-nav buttons — pass current page to exclude it
function navKeyboard(current?: string): InlineKeyboard {
  const all = [
    { text: '🎯 機會', callback_data: 'cmd:opportunity' },
    { text: '📋 清單', callback_data: 'cmd:watchlist' },
    { text: '📣 KOL', callback_data: 'cmd:kol_list' },
    { text: '❓ 說明', callback_data: 'cmd:help' },
  ];
  return [all.filter(b => b.callback_data !== current)];
}
const NAV_KEYBOARD: InlineKeyboard = navKeyboard();

// ============================================================
// Webhook handler
// ============================================================

/**
 * Telegram Webhook endpoint.
 *
 * Handles:
 * - Text messages: /機會, /清單, /kol, /說明, /help, /指令, @KOL名稱, /TSLA, /2330 etc.
 * - Callback queries from inline keyboard buttons
 */
export async function POST(request: NextRequest) {
  const update = await request.json();

  // Handle callback_query (inline keyboard button press)
  if (update.callback_query) {
    const cbq = update.callback_query;
    const chatId = cbq.message?.chat?.id;
    const data = cbq.data as string;

    if (chatId && data) {
      // Acknowledge immediately
      await answerCallbackQuery(cbq.id);
      await handleCommand(chatId, data);
    }

    return NextResponse.json({ ok: true });
  }

  // Handle text message
  const message = update.message;
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const rawText = message.text.trim();

  // Only respond to messages with "/" prefix or "@" prefix
  if (!rawText.startsWith('/') && !rawText.startsWith('@')) {
    return NextResponse.json({ ok: true });
  }

  // Strip "/" prefix and parse command; handle bot username suffix (e.g. /kol@mybotname)
  let cmdText = rawText.startsWith('/') ? rawText.slice(1).trim() : rawText;
  // Remove @botname suffix from slash commands like /kol@mybot (but NOT from @KOL queries)
  if (rawText.startsWith('/')) {
    cmdText = cmdText.replace(/@\S+/, '').trim();
  }
  const cmdLower = cmdText.toLowerCase();

  // Route commands
  if (cmdLower === '說明' || cmdLower === 'help' || cmdLower === '指令' || cmdLower === 'start') {
    await handleCommand(chatId, 'cmd:help');
  } else if (cmdLower === '機會' || cmdLower === 'opportunity') {
    await handleCommand(chatId, 'cmd:opportunity');
  } else if (cmdLower === '清單' || cmdLower === '追蹤') {
    await handleCommand(chatId, 'cmd:watchlist');
  } else if (cmdLower === 'kol') {
    await handleCommand(chatId, 'cmd:kol_list');
  } else if (rawText.startsWith('@') || cmdText.startsWith('@')) {
    // @KOL名稱
    const kolName = cmdText.startsWith('@') ? cmdText.slice(1).trim() : cmdText;
    if (kolName) {
      await handleCommand(chatId, `kol:${kolName}`);
    }
  } else if (cmdText.length > 0 && cmdText.length <= 20) {
    // Stock ticker lookup
    await handleCommand(chatId, `stock:${cmdText}`);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

// ============================================================
// Command router
// ============================================================

async function handleCommand(chatId: string | number, command: string): Promise<void> {
  if (command === 'cmd:help') {
    await sendHelpReply(chatId);
  } else if (command === 'cmd:opportunity') {
    await sendOpportunityReply(chatId);
  } else if (command === 'cmd:watchlist') {
    await sendWatchlistReply(chatId);
  } else if (command === 'cmd:kol_list') {
    await sendKolListReply(chatId);
  } else if (command.startsWith('kol:')) {
    const kolName = command.slice(4);
    await sendKolReply(chatId, kolName);
  } else if (command.startsWith('stock:')) {
    const query = command.slice(6);
    await sendStockReply(chatId, query);
  }
}

// ============================================================
// /說明 (Help)
// ============================================================

async function sendHelpReply(chatId: string | number): Promise<void> {
  const html = [
    '👋 <b>歡迎使用懶懶財經 Bot！</b>',
    '',
    '我會自動追蹤 KOL 推薦的股票，',
    '當技術面出現好的進場時機時通知你。',
    '',
    '━━━━━━━━━━━━━━━',
    '🎯 <b>快捷按鈕（點下方按鈕）</b>',
    '━━━━━━━━━━━━━━━',
    '',
    '🎯 <b>機會</b> — 近期有進場訊號的股票',
    '   依技術面 + KOL 共識度評分排序',
    '',
    '📋 <b>清單</b> — 目前追蹤中的所有股票',
    '   美股 + 台股完整清單',
    '',
    '📣 <b>KOL</b> — 追蹤的 KOL 列表',
    '   點擊 KOL 名稱查看他的觀點',
    '',
    '━━━━━━━━━━━━━━━',
    '🔍 <b>手動查詢（直接輸入）</b>',
    '━━━━━━━━━━━━━━━',
    '',
    '查個股 → 輸入 <code>/TSLA</code>、<code>/2330</code> 或 <code>/台積電</code>',
    '查觀點 → 輸入 <code>@股癌</code>、<code>@NaNa</code>',
    '',
    '━━━━━━━━━━━━━━━',
    '📖 <b>系統如何運作？</b>',
    '━━━━━━━━━━━━━━━',
    '',
    '1️⃣ 每天自動收聽 KOL podcast，提取看多的股票',
    '2️⃣ AI 分析產業趨勢，擴展相關概念股',
    '3️⃣ 持續監控技術面（RSI、均線、跌幅）',
    '4️⃣ 出現進場訊號時推送通知到群組',
    '',
    '<b>入場分數</b>：訊號強度 + KOL 共識度 + 新鮮度',
    '<b>RSI 熱度</b>：0-30 偏冷（低點機會）｜ 30-60 中性 ｜ 60+ 偏熱（追高風險）',
  ].join('\n');

  await sendMessage(chatId, html, navKeyboard('cmd:help'));
}

// ============================================================
// /機會 (Opportunities)
// ============================================================

async function sendOpportunityReply(chatId: string | number): Promise<void> {
  const { opportunities, totalStocksScanned } = await fetchOpportunities();

  if (opportunities.length === 0) {
    await sendMessage(
      chatId,
      '🎯 近 7 日沒有偵測到進場機會。\n\n系統每日掃描追蹤股票的技術訊號（回檔、RSI超賣、均線支撐等），有機會時會自動通知。',
      NAV_KEYBOARD,
    );
    return;
  }

  const lines: string[] = [
    '🎯 <b>進場機會</b>',
    '<i>KOL 看好 + 技術面訊號 · 近 7 日</i>',
    '━━━━━━━━━━━━━━━',
    '',
  ];

  for (const opp of opportunities) {
    const flag = opp.market === 'TW' ? '🇹🇼' : '🇺🇸';
    const kolInfo = opp.kolName ? `${opp.kolName}${opp.kolDate} 看好` : '';

    lines.push(`${flag} <b>${opp.ticker}</b>  ⚡${Math.round(opp.score)}分`);

    const details: string[] = [];
    if (opp.triggerPrice) details.push(`$${opp.triggerPrice.toFixed(2)}`);
    if (opp.rsi !== null) details.push(`RSI ${opp.rsi.toFixed(0)}`);
    if (opp.dropPct !== null && opp.dropPct < -3) details.push(`${opp.dropPct.toFixed(0)}%`);

    const labels = opp.alertTypes
      .map((t: string) => ALERT_TYPE_CONFIG[t]?.label)
      .filter(Boolean)
      .slice(0, 3);

    lines.push(`   ${details.join(' ｜ ')}${labels.length > 0 ? ` · ${labels.join('、')}` : ''}`);
    if (kolInfo) lines.push(`   ${kolInfo}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━');
  lines.push(`<i>分數越高 = 技術訊號越強 + KOL 共識越高</i>`);
  lines.push(`共掃描 ${totalStocksScanned} 檔追蹤股`);

  await sendMessage(chatId, lines.join('\n'), navKeyboard('cmd:opportunity'));
}

// ============================================================
// /清單 (Watchlist)
// ============================================================

async function sendWatchlistReply(chatId: string | number): Promise<void> {
  const { scoredStocks, allStocks, usStocks, twStocks } = await fetchWatchlist();

  if (allStocks.length === 0) {
    await sendMessage(chatId, '目前沒有追蹤中的股票。', navKeyboard('cmd:watchlist'));
    return;
  }

  const topPicks = scoredStocks.slice(0, 5);

  // Message 1: Entry opportunities
  const oppLines: string[] = [
    '🎯 <b>入場機會</b>（近 7 天）',
    '━━━━━━━━━━━━━━━',
    '',
  ];

  if (topPicks.length > 0) {
    for (const pick of topPicks) {
      const flag = pick.market === 'TW' ? '🇹🇼' : '🇺🇸';
      const consensus = pick.consensus === '多方共識' ? ' 👥' : '';
      oppLines.push(`${flag} <b>${pick.ticker}</b>  ⚡${Math.round(pick.score)}分`);
      oppLines.push(`   ⚡ ${pick.alertLabels.join('・')}${consensus}`);
      if (pick.rsi !== null) {
        oppLines.push(`   熱度 ${pick.rsi.toFixed(0)}/100`);
      }
      oppLines.push('');
    }
    oppLines.push('━━━━━━━━━━━━━━━');
    oppLines.push('<i>分數越高 = 訊號越強 + 共識越高</i>');
  } else {
    oppLines.push('✅ 近 7 天無明顯入場訊號');
    oppLines.push('持續監控中...');
  }

  await sendMessage(chatId, oppLines.join('\n'));

  // Message 2: Full stock list
  const formatTicker = (s: WatchlistStockRow) => {
    if (s.market === 'TW' && s.name) return `${s.name}(${s.ticker})`;
    return s.ticker;
  };
  const usTickerList = usStocks.map(formatTicker).join('・');
  const twTickerList = twStocks.map(formatTicker).join('・');

  const listLines: string[] = [
    `📋 <b>監控總覽</b>（${allStocks.length} 檔）`,
    '━━━━━━━━━━━━━━━',
    '',
  ];

  if (usStocks.length > 0) {
    listLines.push(`🇺🇸 <b>美股</b>（${usStocks.length} 檔）`);
    listLines.push(usTickerList);
    listLines.push('');
  }

  if (twStocks.length > 0) {
    listLines.push(`🇹🇼 <b>台股</b>（${twStocks.length} 檔）`);
    listLines.push(twTickerList);
    listLines.push('');
  }

  listLines.push('💡 輸入代號查詳情（如 <code>/TSLA</code>）');

  await sendMessage(chatId, listLines.join('\n'), navKeyboard('cmd:watchlist'));
}

// ============================================================
// /kol (KOL List)
// ============================================================

async function sendKolListReply(chatId: string | number): Promise<void> {
  const { podcasts, youtubes, total } = await fetchKolList();

  if (total === 0) {
    await sendMessage(chatId, '目前沒有 KOL 資料。', navKeyboard('cmd:kol_list'));
    return;
  }

  const lines: string[] = [
    `📣 <b>KOL 列表</b>（${total} 位）`,
    '━━━━━━━━━━━━━━━',
    '',
  ];

  if (podcasts.length > 0) {
    lines.push('🎙️ <b>Podcast</b>');
    for (const p of podcasts) {
      const shortName = extractKolKeyword(p.name);
      lines.push(`• ${p.name}  ▸ <code>@${shortName}</code>`);
    }
    lines.push('');
  }

  if (youtubes.length > 0) {
    lines.push('📺 <b>YouTube</b>');
    for (const y of youtubes) {
      const shortName = extractKolKeyword(y.name);
      lines.push(`• ${y.name}  ▸ <code>@${shortName}</code>`);
    }
    lines.push('');
  }

  lines.push('💡 點擊指令複製，或用下方按鈕快速查看');

  // Featured KOL buttons
  const kolButtons: InlineKeyboard = [];
  const featured = [...FEATURED_KOL_KEYWORDS];
  const row: Array<{ text: string; callback_data: string }> = [];
  for (const name of featured) {
    row.push({ text: `📣 ${name}`, callback_data: `kol:${name}` });
    if (row.length === 3) {
      kolButtons.push([...row]);
      row.length = 0;
    }
  }
  if (row.length > 0) kolButtons.push([...row]);
  kolButtons.push(NAV_KEYBOARD[0]);

  await sendMessage(chatId, lines.join('\n'), kolButtons);
}

// ============================================================
// @KOL (KOL Detail)
// ============================================================

async function sendKolReply(chatId: string | number, kolName: string): Promise<void> {
  const { actualKolName, bullish, bearish, monitor, dateRange } = await fetchKolOpinions(kolName);

  if (bullish.length === 0 && bearish.length === 0 && monitor.length === 0) {
    await sendMessage(
      chatId,
      `找不到「${kolName}」的觀點資料。\n\n提示：輸入 /kol 查看所有 KOL 列表`,
      NAV_KEYBOARD,
    );
    return;
  }

  const lines: string[] = [
    `📣 <b>${actualKolName}</b>`,
    `<i>近期觀點 · ${dateRange}</i>`,
    '━━━━━━━━━━━━━━━',
    '',
  ];

  const confidenceMap: Record<string, string> = { high: '高', medium: '中', low: '低' };
  const timeHorizonMap: Record<string, string> = { short: '短線', medium: '中線', long: '長線' };

  const addSection = (title: string, items: StockOpinion[]) => {
    if (items.length === 0) return;
    lines.push(`${title}（${items.length} 檔）`);
    for (const item of items.slice(0, 8)) {
      lines.push(`• <b>${item.ticker}</b>（${item.date}）：${item.reason}`);

      const details: string[] = [];
      if (item.action) details.push(item.action);
      if (item.confidence) details.push(`信心${confidenceMap[item.confidence] || item.confidence}`);
      if (item.timeHorizon) details.push(timeHorizonMap[item.timeHorizon] || item.timeHorizon);
      if (item.priceLevel) details.push(`目標 ${item.priceLevel}`);
      if (details.length > 0) {
        lines.push(`  <i>${details.join(' ｜ ')}</i>`);
      }
    }
    if (items.length > 8) {
      lines.push(`...還有 ${items.length - 8} 檔`);
    }
    lines.push('');
  };

  addSection('📈 <b>看多</b>', bullish);
  addSection('👀 <b>觀望</b>', monitor);
  addSection('📉 <b>看空</b>', bearish);

  lines.push('━━━━━━━━━━━━━━━');
  lines.push('<i>資料來源：podcast 分析</i>');

  const keyboard: InlineKeyboard = [
    [
      { text: '📣 其他 KOL', callback_data: 'cmd:kol_list' },
      { text: '🎯 機會', callback_data: 'cmd:opportunity' },
      { text: '📋 清單', callback_data: 'cmd:watchlist' },
    ],
  ];

  await sendMessage(chatId, lines.join('\n'), keyboard);
}

// ============================================================
// /TICKER (Stock Detail)
// ============================================================

function formatRsiBar(rsi: number): string {
  const segments = Math.round(rsi / 10);
  let filled: string;
  let label: string;

  if (rsi < 30) { filled = '🟦'; label = '偏冷'; }
  else if (rsi < 40) { filled = '🔷'; label = '偏弱'; }
  else if (rsi < 60) { filled = '⬛'; label = '中性'; }
  else if (rsi < 70) { filled = '🟧'; label = '偏熱'; }
  else { filled = '🟥'; label = '過熱'; }

  return `${filled.repeat(segments)}${'⬜'.repeat(10 - segments)} ${label}`;
}

async function sendStockReply(chatId: string | number, query: string): Promise<void> {
  const result = await fetchStockDetail(query);

  if (!result) {
    await sendMessage(
      chatId,
      `🔍 找不到「${query}」\n\n輸入 /清單 查看所有追蹤股票\n輸入 /說明 查看指令`,
      NAV_KEYBOARD,
    );
    return;
  }

  if (result.type === 'watchlist') {
    const { stock, snapshot, recentAlertTypes, kolOpinions } = result;
    const market = stock.market;
    const flag = market === 'TW' ? '🇹🇼' : '🇺🇸';
    const currency = market === 'TW' ? 'NT$' : '$';
    const displayName = stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker;

    const lines: string[] = [
      `${flag} <b>${displayName}</b>`,
      '━━━━━━━━━━━━━━━',
      '',
    ];

    // Price
    if (stock.current_price) {
      lines.push(`💲 <b>${currency}${stock.current_price.toFixed(2)}</b>`);
      lines.push('');
    }

    // Technical indicators
    if (snapshot) {
      const rsi = snapshot.rsi14;
      if (rsi !== null) {
        lines.push(`🌡 市場熱度  <b>${rsi.toFixed(0)}</b> / 100`);
        lines.push(formatRsiBar(rsi));
        lines.push('');
      }

      // SMA reference prices
      const price = stock.current_price || snapshot.currentPrice;
      if (snapshot.sma50) {
        const diff = price > 0 ? ((price - snapshot.sma50) / snapshot.sma50 * 100) : 0;
        lines.push(`📊 50日均線  ${currency}${snapshot.sma50.toFixed(2)} (<b>${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</b>)`);
      }
      if (snapshot.sma200) {
        const diff = price > 0 ? ((price - snapshot.sma200) / snapshot.sma200 * 100) : 0;
        lines.push(`📊 200日均線  ${currency}${snapshot.sma200.toFixed(2)} (<b>${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</b>)`);
      }
      if (snapshot.sma50 || snapshot.sma200) lines.push('');
    }

    // Recent alert signals (deduplicate overlapping drop signals)
    if (recentAlertTypes.length > 0) {
      const filtered = recentAlertTypes.filter(t => {
        if (t === 'significant_drop_5pct' && recentAlertTypes.includes('significant_drop_10pct')) return false;
        if (t === 'significant_drop_5pct' && recentAlertTypes.includes('significant_drop_20pct')) return false;
        if (t === 'significant_drop_10pct' && recentAlertTypes.includes('significant_drop_20pct')) return false;
        return true;
      });
      for (const alertType of filtered) {
        const cfg = ALERT_TYPE_CONFIG[alertType];
        if (cfg) {
          lines.push(`⚡ ${cfg.label}：${cfg.detail}`);
        }
      }
      lines.push('');
    }

    // KOL opinions
    if (kolOpinions.length > 0) {
      lines.push('━━━━━━━━━━━━━━━');
      lines.push('📣 <b>KOL 觀點</b>');
      lines.push('');

      for (const k of kolOpinions) {
        const icon = SENTIMENT_ICON[k.sentiment] || '📣';
        const sentLabel = k.sentiment === 'bullish' ? '看多' : k.sentiment === 'bearish' ? '看空' : '觀望';
        const dateStr = formatShortDate(k.date);

        lines.push(`${icon} <b>${k.kol}</b>  <code>${sentLabel}${dateStr}</code>`);
        lines.push(k.reason);
        lines.push('');
      }
    }

    // Consensus
    if (stock.consensus) {
      lines.push(`共識：${stock.consensus}`);
    }

    lines.push('━━━━━━━━━━━━━━━');
    lines.push(`<i>${kolOpinions.length} 位 KOL 近期觀點 ｜ /說明 了解更多</i>`);

    await sendMessage(chatId, lines.join('\n'), navKeyboard());
  } else {
    // Analyses-only (untracked stock)
    const { query: q, opinions } = result;

    const lines: string[] = [
      `🔍 <b>${q.toUpperCase()}</b>`,
      '⚠️ <i>此股票未加入追蹤（無技術指標）</i>',
      '━━━━━━━━━━━━━━━',
      '',
      '📣 <b>KOL 觀點</b>',
      '',
    ];

    const sortedOpinions = [...opinions].sort((a, b) => kolPriority(a.kol) - kolPriority(b.kol));
    for (const k of sortedOpinions.slice(0, 5)) {
      const icon = SENTIMENT_ICON[k.sentiment] || '📣';
      const sentLabel = k.sentiment === 'bullish' ? '看多' : k.sentiment === 'bearish' ? '看空' : '觀望';
      const dateStr = formatShortDate(k.date);
      lines.push(`${icon} <b>${k.kol}</b>（${sentLabel}）${dateStr}：${k.reason}`);
      lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━');
    lines.push('<i>此股票未被系統自動追蹤</i>');

    await sendMessage(chatId, lines.join('\n'), navKeyboard());
  }
}
