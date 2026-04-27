import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = any;

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

const SENTIMENT_ICON: Record<string, string> = {
  bullish: '📈',
  bearish: '📉',
  monitor: '👀',
};

/**
 * LINE Webhook endpoint.
 * Commands:
 * - "說明" / "help" / "指令" → usage guide
 * - "清單" / "追蹤" → watchlist with entry opportunities
 * - "kol" → list all available KOLs
 * - "@KOL名稱" → KOL recent opinions
 * - Stock ticker (TSLA, 2330, 台積電) → stock detail
 * - "groupid" → group ID echo (admin)
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
    const text = rawText.toLowerCase();
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) continue;

    // Command: groupid
    if (text.includes('groupid') && source.type === 'group') {
      await replyMessage(token, event.replyToken, [{
        type: 'text', text: `✅ Group ID: ${source.groupId}`,
      }]);
      continue;
    }

    // Command: 說明 / help / 指令
    if (text === '說明' || text === 'help' || text === '指令') {
      await replyMessage(token, event.replyToken, [buildHelpMessage()]);
      continue;
    }

    // Command: 清單 / 追蹤
    if (text === '清單' || text === '追蹤') {
      await replyMessage(token, event.replyToken, await buildWatchlistReply());
      continue;
    }

    // Command: KOL list
    if (text === 'kol') {
      await replyMessage(token, event.replyToken, await buildKolListReply());
      continue;
    }

    // Command: @KOL名稱
    if (rawText.startsWith('@') && rawText.length > 1) {
      const kolName = rawText.slice(1).trim();
      await replyMessage(token, event.replyToken, await buildKolReply(kolName));
      continue;
    }

    // Command: stock ticker lookup (TSLA, 2330, 台積電, etc.)
    // Only process short messages that look like stock queries
    if (rawText.length <= 20 && !rawText.startsWith('/')) {
      const stockReply = await buildStockReply(rawText);
      if (stockReply) {
        await replyMessage(token, event.replyToken, stockReply);
        continue;
      }
    }
  }

  return NextResponse.json({ status: 'ok' });
}

async function replyMessage(token: string, replyToken: string, messages: Msg[]) {
  await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

// ============================================================
// HELP / 說明
// ============================================================

function buildHelpMessage(): Msg {
  return {
    type: 'text',
    text: [
      '📋 可用指令：',
      '',
      '清單 → 入場機會 + 所有追蹤股票',
      'KOL → 查看所有 KOL 列表',
      '說明 → 顯示此說明',
      '',
      '🔍 查個股：直接輸入代號或名稱',
      '  例：TSLA、2330、台積電、TSMC',
      '',
      '📣 查 KOL：輸入 @KOL名稱',
      '  例：@股癌、@NaNa',
      '',
      '───────────',
      '📖 系統運作說明',
      '',
      '追蹤股票來源：',
      '• KOL podcast 中提到看多的股票',
      '• AI 自動擴展相關產業概念股',
      '',
      '入場機會分數：',
      '• 技術訊號（回檔、RSI超賣、均線支撐等）',
      '• KOL 共識越多 → 分數越高',
      '• 訊號越新 → 分數越高',
      '',
      '市場熱度（RSI 0-100）：',
      '• 0-30 偏冷（可能接近低點）',
      '• 30-60 中性',
      '• 60-100 偏熱（追高風險大）',
    ].join('\n'),
  };
}

// ============================================================
// KOL LIST
// ============================================================

async function buildKolListReply(): Promise<Msg[]> {
  const { data: sources } = await supabaseAdmin
    .from('sources')
    .select('name, type')
    .eq('is_active', true)
    .order('type')
    .order('name');

  if (!sources || sources.length === 0) {
    return [{ type: 'text', text: '目前沒有 KOL 資料。' }];
  }

  const podcasts = sources.filter((s: { type: string }) => s.type === 'podcast');
  const youtubes = sources.filter((s: { type: string }) => s.type === 'youtube');

  const body: Msg[] = [];

  const addGroup = (icon: string, label: string, items: Array<{ name: string }>) => {
    if (items.length === 0) return;
    body.push({
      type: 'text', text: `${icon} ${label}`, size: 'sm', weight: 'bold', color: '#333333',
      margin: body.length > 0 ? 'lg' : 'none',
    });
    for (const item of items) {
      // Extract a short keyword from the full name for the query hint
      const shortName = extractKolKeyword(item.name);
      body.push({
        type: 'text',
        text: `• ${item.name}\n  → 輸入 @${shortName}`,
        size: 'xs', color: '#555555', wrap: true, margin: 'sm',
      });
    }
  };

  addGroup('🎙️', 'Podcast', podcasts);
  addGroup('📺', 'YouTube', youtubes);

  return [{
    type: 'flex',
    altText: `📣 KOL 列表（${sources.length} 位）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#4A148C', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📣 KOL 列表', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: `共 ${sources.length} 位 KOL`, size: 'xs', color: '#ffffffcc' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'none',
        contents: body,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'text', text: '輸入 @名稱 查看該 KOL 近期觀點', size: 'xxs', color: '#AAAAAA', align: 'center' },
        ],
      },
    },
  }];
}

/**
 * Extract a short, recognizable keyword from a KOL name for the query hint.
 * e.g. "Gooaye 股癌" → "股癌", "NaNa說美股" → "NaNa", "韭菜畢業班" → "韭菜畢業班"
 */
function extractKolKeyword(name: string): string {
  // Known mappings for cleaner hints
  const map: Record<string, string> = {
    'Gooaye 股癌': '股癌',
    '美股航海王｜指數流': '航海王',
    '韭菜畢業班': '韭菜畢業班',
    '美股投資學-財女珍妮': '財女珍妮',
    '游庭皓的財經皓角': '財經皓角',
    'Nick 美股咖啡館': 'Nick',
    'NaNa說美股': 'NaNa',
    '陽光財經': '陽光財經',
  };
  return map[name] || name;
}

// ============================================================
// STOCK LOOKUP
// ============================================================

/** Format "2026-04-18" → " 4/18", empty string if no date */
function formatShortDate(dateStr: string): string {
  if (!dateStr || dateStr === 'unknown') return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return ` ${d.getMonth() + 1}/${d.getDate()}`;
}

/** Get ISO date string for 2 months ago */
function twoMonthsAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return d.toISOString();
}

/** Check if a date string is within the last 2 months */
function isWithinTwoMonths(dateStr: string): boolean {
  if (!dateStr || dateStr === 'unknown') return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  return d >= cutoff;
}

// Priority KOLs — always show first when multiple KOLs mention same stock
const PRIORITY_KOLS = ['股癌', '游庭皓'];

function kolPriority(kolName: string): number {
  for (let i = 0; i < PRIORITY_KOLS.length; i++) {
    if (kolName.includes(PRIORITY_KOLS[i])) return i;
  }
  return PRIORITY_KOLS.length;
}

// Common English aliases for stocks (uppercase keys)
const TICKER_ALIASES: Record<string, string> = {
  'TSMC': '2330.TW',
  '聯發科': '2454.TW',
  '鴻海': '2317.TW',
};

// Normalize common traditional/simplified Chinese character differences
function normalizeChineseChars(text: string): string {
  const map: Record<string, string> = { '臺': '台', '積': '積', '體': '體' };
  return text.replace(/[臺]/g, c => map[c] || c);
}

function matchesStock(
  s: { ticker: string; ticker_normalized: string; name: string | null },
  query: string,
  qUpper: string,
): boolean {
  // Exact normalized match
  if (s.ticker_normalized === qUpper) return true;
  // TW number shorthand: "2330" → "2330.TW"
  if (s.ticker_normalized === `${qUpper}.TW`) return true;
  // Exact ticker match
  if (s.ticker === query) return true;
  // Name contains query (case-insensitive, with Chinese normalization)
  if (s.name) {
    const normName = normalizeChineseChars(s.name).toLowerCase();
    const normQuery = normalizeChineseChars(query).toLowerCase();
    if (normName.includes(normQuery)) return true;
  }
  // Ticker contains query (e.g. query "台積電" matches ticker "台積電 (2330)")
  if (normalizeChineseChars(s.ticker).toLowerCase().includes(normalizeChineseChars(query).toLowerCase())) return true;
  // Alias match (e.g. "TSMC" → "2330.TW")
  const aliasTarget = TICKER_ALIASES[qUpper];
  if (aliasTarget && s.ticker_normalized === aliasTarget) return true;
  return false;
}

async function buildStockReply(query: string): Promise<Msg[] | null> {
  const q = query.toUpperCase().trim();

  // Try watchlist first
  const { data: stocks } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('*')
    .eq('status', 'active');

  const stock = (stocks || []).find((s: { ticker: string; ticker_normalized: string; name: string | null }) =>
    matchesStock(s, query, q)
  );

  if (stock) {
    return buildWatchlistStockBubble(stock);
  }

  // Fallback: search analyses for KOL mentions
  const kolOpinions = await searchAnalysesForStock(query);
  if (kolOpinions.length > 0) {
    return buildAnalysesStockBubble(query, kolOpinions);
  }

  // Not found at all — return null so we don't reply to random messages
  return null;
}

async function buildWatchlistStockBubble(stock: Msg): Promise<Msg[]> {
  const market = stock.market;
  const marketLabel = market === 'TW' ? '🇹🇼 台股' : '🇺🇸 美股';
  const headerColor = market === 'TW' ? '#1B5E20' : '#0D47A1';
  const currency = market === 'TW' ? 'NT$' : '$';
  const displayName = stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker;

  const body: Msg[] = [];

  // Price info
  if (stock.current_price) {
    const priceText = `${currency}${stock.current_price.toFixed(2)}`;
    let changeText = '';
    if (stock.price_at_first_mention && stock.price_at_first_mention > 0) {
      const change = ((stock.current_price - stock.price_at_first_mention) / stock.price_at_first_mention * 100);
      const sign = change >= 0 ? '+' : '';
      changeText = `  (${sign}${change.toFixed(1)}%)`;
    }
    body.push({
      type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: '現價', size: 'sm', color: '#999999', flex: 2 },
        { type: 'text', text: `${priceText}${changeText}`, size: 'md', weight: 'bold', color: '#111111', flex: 5, align: 'end' },
      ],
    });
  }

  // Recent alerts
  const { data: alerts } = await supabaseAdmin
    .from('stock_alerts')
    .select('alert_type, technical_snapshot, created_at')
    .or(`ticker.eq.${stock.ticker},ticker.eq.${stock.ticker_normalized}`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (alerts && alerts.length > 0) {
    const latestSnapshot = alerts[0].technical_snapshot as { rsi14?: number } | null;
    const rsi = latestSnapshot?.rsi14;

    if (rsi !== undefined && rsi !== null) {
      body.push({ type: 'separator', margin: 'lg' });
      const rsiColor = rsi < 30 ? '#2196F3' : rsi < 40 ? '#64B5F6' : rsi < 60 ? '#9E9E9E' : rsi < 70 ? '#FF9800' : '#F44336';
      body.push({
        type: 'box', layout: 'horizontal', margin: 'md', contents: [
          { type: 'text', text: '市場熱度', size: 'xs', color: '#999999', flex: 2 },
          { type: 'text', text: `${rsi.toFixed(0)} / 100`, size: 'xs', weight: 'bold', color: rsiColor, flex: 2, align: 'end' },
        ],
      });
    }

    const alertLabels = [...new Set(alerts.map((a: Msg) => ALERT_TYPE_CONFIG[a.alert_type]?.label).filter(Boolean))];
    if (alertLabels.length > 0) {
      body.push({
        type: 'text', text: `⚡ ${alertLabels.join('・')}`, size: 'xs', color: '#E65100', margin: 'sm',
      });
    }
  }

  // KOL opinions (filter out opinions older than 2 months, sort newest first)
  const kolSources = ((stock.kol_sources || []) as Array<{ kol: string; reason: string; sentiment?: string; date?: string }>)
    .filter(k => isWithinTwoMonths(k.date || ''))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (kolSources.length > 0) {
    body.push({ type: 'separator', margin: 'lg' });
    body.push({ type: 'text', text: 'KOL 觀點', size: 'xs', weight: 'bold', color: '#999999', margin: 'md' });

    // Deduplicate by KOL name — newest first so first match = latest opinion
    const kolMap = new Map<string, { kol: string; reason: string; sentiment: string; date: string }>();
    for (const k of kolSources) {
      if (!kolMap.has(k.kol)) {
        kolMap.set(k.kol, { kol: k.kol, reason: k.reason, sentiment: k.sentiment || 'bullish', date: k.date || '' });
      }
    }

    const uniqueKols = Array.from(kolMap.values())
      .sort((a, b) => kolPriority(a.kol) - kolPriority(b.kol))
      .slice(0, 5);
    for (const k of uniqueKols) {
      const icon = SENTIMENT_ICON[k.sentiment] || '📣';
      const sentLabel = k.sentiment === 'bullish' ? '看多' : k.sentiment === 'bearish' ? '看空' : '觀望';
      const dateStr = formatShortDate(k.date);
      body.push({
        type: 'text',
        text: `${icon} ${k.kol}(${sentLabel})${dateStr}：${k.reason}`,
        size: 'xs', color: '#555555', wrap: true, margin: 'sm',
      });
    }
  }

  // Consensus
  if (stock.consensus) {
    body.push({
      type: 'text', text: `共識：${stock.consensus}`, size: 'xxs', color: '#AAAAAA', margin: 'lg',
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
          { type: 'text', text: `數據來自 ${kolSources.length} 位 KOL`, size: 'xxs', color: '#AAAAAA', align: 'center' },
        ],
      },
    },
  }];
}

interface KolOpinion {
  kol: string;
  sentiment: string;
  reason: string;
  date: string;
}

async function searchAnalysesForStock(query: string): Promise<KolOpinion[]> {
  const q = query.toUpperCase().trim();
  const normQuery = normalizeChineseChars(query).toLowerCase();
  const { data: analyses } = await supabaseAdmin
    .from('analyses')
    .select('full_analysis, created_at')
    .gte('created_at', twoMonthsAgoISO())
    .order('created_at', { ascending: false })
    .limit(100);

  if (!analyses) return [];

  const opinions: KolOpinion[] = [];
  const seen = new Set<string>();

  for (const a of analyses) {
    const fa = a.full_analysis as { podcastName?: string; signals?: Array<{ ticker: string; type: string; reason: string }> } | null;
    if (!fa?.signals || !fa.podcastName) continue;

    const date = a.created_at ? a.created_at.split('T')[0] : '';

    for (const sig of fa.signals) {
      if (!sig.ticker) continue;
      const ticker = sig.ticker.toUpperCase();
      const normTicker = normalizeChineseChars(sig.ticker).toLowerCase();
      // Match: exact ticker, contains TW number, contains query, or alias
      const twNum = q.replace('.TW', '');
      const aliasTarget = TICKER_ALIASES[q];
      if (
        ticker !== q &&
        !ticker.includes(q) &&
        !ticker.includes(twNum) &&
        !normTicker.includes(normQuery) &&
        !(aliasTarget && ticker.includes(aliasTarget.replace('.TW', '')))
      ) continue;

      const key = `${fa.podcastName}|${sig.type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      opinions.push({
        kol: fa.podcastName,
        sentiment: sig.type,
        reason: sig.reason || '',
        date,
      });
    }
  }

  return opinions.slice(0, 8);
}

async function buildAnalysesStockBubble(query: string, opinions: KolOpinion[]): Promise<Msg[]> {
  const body: Msg[] = [
    { type: 'text', text: '⚠️ 此股票未加入追蹤（無技術指標）', size: 'xs', color: '#FF6F00', wrap: true },
    { type: 'separator', margin: 'lg' },
    { type: 'text', text: 'KOL 觀點', size: 'xs', weight: 'bold', color: '#999999', margin: 'md' },
  ];

  const sortedOpinions = [...opinions].sort((a, b) => kolPriority(a.kol) - kolPriority(b.kol));
  for (const k of sortedOpinions.slice(0, 5)) {
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
// KOL LOOKUP
// ============================================================

async function buildKolReply(kolName: string): Promise<Msg[]> {
  const { data: analyses } = await supabaseAdmin
    .from('analyses')
    .select('full_analysis, created_at')
    .gte('created_at', twoMonthsAgoISO())
    .order('created_at', { ascending: false })
    .limit(200);

  if (!analyses) {
    return [{ type: 'text', text: `找不到 ${kolName} 的觀點資料。` }];
  }

  interface StockOpinion { ticker: string; sentiment: string; reason: string; date: string }
  const bullish: StockOpinion[] = [];
  const bearish: StockOpinion[] = [];
  const monitor: StockOpinion[] = [];
  const seenTickers = new Set<string>();

  for (const a of analyses) {
    const fa = a.full_analysis as { podcastName?: string; signals?: Array<{ ticker: string; type: string; reason: string }> } | null;
    if (!fa?.signals || !fa.podcastName) continue;
    if (!fa.podcastName.toLowerCase().includes(kolName.toLowerCase())) continue;

    const date = a.created_at ? new Date(a.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '';

    for (const sig of fa.signals) {
      if (!sig.ticker || seenTickers.has(`${sig.ticker}|${sig.type}`)) continue;
      seenTickers.add(`${sig.ticker}|${sig.type}`);

      const item = { ticker: sig.ticker, sentiment: sig.type, reason: sig.reason || '', date };
      if (sig.type === 'bullish') bullish.push(item);
      else if (sig.type === 'bearish') bearish.push(item);
      else monitor.push(item);
    }
  }

  if (bullish.length === 0 && bearish.length === 0 && monitor.length === 0) {
    return [{ type: 'text', text: `找不到「${kolName}」的觀點資料。\n\n提示：輸入 @KOL名稱，如 @股癌、@NaNa` }];
  }

  const body: Msg[] = [];

  const addSection = (title: string, items: StockOpinion[], color: string) => {
    if (items.length === 0) return;
    body.push({
      type: 'text', text: `${title}（${items.length} 檔）`, size: 'sm', weight: 'bold', color, margin: body.length > 0 ? 'lg' : 'none',
    });
    for (const item of items.slice(0, 5)) {
      body.push({
        type: 'text', text: `• ${item.ticker}：${item.reason}`, size: 'xs', color: '#555555', wrap: true, margin: 'xs',
      });
    }
    if (items.length > 5) {
      body.push({ type: 'text', text: `...還有 ${items.length - 5} 檔`, size: 'xxs', color: '#AAAAAA', margin: 'xs' });
    }
  };

  addSection('📈 看多', bullish, '#1B5E20');
  addSection('👀 觀望', monitor, '#F57F17');
  addSection('📉 看空', bearish, '#B71C1C');

  // Find the actual KOL name from the data
  let actualKolName = kolName;
  for (const a of analyses) {
    const fa = a.full_analysis as { podcastName?: string } | null;
    if (fa?.podcastName?.toLowerCase().includes(kolName.toLowerCase())) {
      actualKolName = fa.podcastName;
      break;
    }
  }

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
          { type: 'text', text: '資料來源：近期 podcast 分析', size: 'xxs', color: '#AAAAAA', align: 'center' },
        ],
      },
    },
  }];
}

// ============================================================
// WATCHLIST (SIMPLIFIED)
// ============================================================

async function buildWatchlistReply(): Promise<Msg[]> {
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
      .select('ticker, alert_type, technical_snapshot, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const stocks = stocksRes.data || [];
  const alerts = alertsRes.data || [];

  if (stocks.length === 0) {
    return [{ type: 'text', text: '目前沒有追蹤中的股票。' }];
  }

  // Build scored opportunities
  const tickerAlerts = new Map<string, typeof alerts>();
  for (const alert of alerts) {
    if (!tickerAlerts.has(alert.ticker)) tickerAlerts.set(alert.ticker, []);
    tickerAlerts.get(alert.ticker)!.push(alert);
  }

  interface ScoredStock {
    ticker: string; market: string; score: number;
    alertLabels: string[]; rsi: number | null; consensus: string | null;
  }

  const scoredStocks: ScoredStock[] = [];
  for (const stock of stocks) {
    const sa = tickerAlerts.get(stock.ticker) || tickerAlerts.get(stock.ticker_normalized) || [];
    if (sa.length === 0) continue;

    let score = 0;
    const labels = new Set<string>();
    for (const a of sa) {
      const cfg = ALERT_TYPE_CONFIG[a.alert_type];
      if (cfg) {
        const age = (Date.now() - new Date(a.created_at).getTime()) / 86400000;
        score += cfg.score * (0.5 + 0.5 * Math.max(0, 1 - age / 7));
        labels.add(cfg.label);
      }
    }
    if (stock.consensus === '多方共識') score += 20;
    else if (stock.consensus === '單一來源') score += 5;
    score += Math.min((stock.mention_count || 1) * 3, 15);

    const snap = sa[0]?.technical_snapshot as { rsi14?: number } | null;
    scoredStocks.push({
      ticker: stock.name ? `${stock.name} (${stock.ticker})` : stock.ticker,
      market: stock.market, score,
      alertLabels: Array.from(labels),
      rsi: snap?.rsi14 ?? null,
      consensus: stock.consensus,
    });
  }

  scoredStocks.sort((a, b) => b.score - a.score);
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
  const usStocks = stocks.filter((s: { market: string }) => s.market === 'US');
  const twStocks = stocks.filter((s: { market: string }) => s.market === 'TW');

  // Format stock display: use ticker for US, name(ticker) for TW
  const formatTicker = (s: { ticker: string; name: string | null; market: string }) => {
    if (s.market === 'TW' && s.name) return `${s.name}(${s.ticker})`;
    return s.ticker;
  };
  const usTickerList = usStocks.map(formatTicker).join('・');
  const twTickerList = twStocks.map(formatTicker).join('・');

  const listBody: Msg[] = [];
  if (usStocks.length > 0) {
    listBody.push({ type: 'text', text: `🇺🇸 美股（${usStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#0D47A1' });
    listBody.push({ type: 'text', text: usTickerList, size: 'xs', color: '#555555', wrap: true, margin: 'sm' });
  }
  if (twStocks.length > 0) {
    listBody.push({ type: 'text', text: `🇹🇼 台股（${twStocks.length} 檔）`, size: 'sm', weight: 'bold', color: '#1B5E20', margin: usStocks.length > 0 ? 'lg' : 'none' });
    listBody.push({ type: 'text', text: twTickerList, size: 'xs', color: '#555555', wrap: true, margin: 'sm' });
  }
  listBody.push({ type: 'separator', margin: 'lg' });
  listBody.push({ type: 'text', text: '💡 輸入股票代號查詳情', size: 'xs', color: '#999999', margin: 'md' });
  listBody.push({ type: 'text', text: '💡 輸入 @KOL名稱 查觀點', size: 'xs', color: '#999999', margin: 'xs' });
  listBody.push({ type: 'text', text: '💡 輸入「說明」查看所有指令', size: 'xs', color: '#999999', margin: 'xs' });

  messages.push({
    type: 'flex',
    altText: `📋 追蹤清單（${stocks.length} 檔）`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#37474F', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📋 監控總覽', size: 'lg', weight: 'bold', color: '#ffffff' },
          { type: 'text', text: `共 ${stocks.length} 檔監控中`, size: 'xs', color: '#ffffffcc' },
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

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
