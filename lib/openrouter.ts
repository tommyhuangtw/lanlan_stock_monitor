import OpenAI from 'openai';

/**
 * Attempt to repair common JSON syntax errors from AI responses
 */
function repairJson(jsonStr: string): string {
  let str = jsonStr;

  // Remove any text before the first { and after the last }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    str = str.slice(firstBrace, lastBrace + 1);
  }

  // Remove truncation indicators like "..." or "…" on their own lines
  str = str.replace(/,\s*["']?\.{2,}["']?\s*([,\]}])/g, '$1');
  str = str.replace(/["']?\.{2,}["']?\s*,?\s*([}\]])/g, '$1');

  // Remove standalone "..." entries in arrays
  str = str.replace(/,\s*["']\.{2,}["']\s*,?/g, ',');

  // Fix trailing commas before ] or }
  str = str.replace(/,\s*([}\]])/g, '$1');

  // Fix missing commas between array elements (common: }"{ should be },"{)
  str = str.replace(/}\s*"/g, '}, "');
  str = str.replace(/"\s*{/g, '", {');

  // Count brackets to see if we need to close any
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (const char of str) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') openBraces++;
    if (char === '}') openBraces--;
    if (char === '[') openBrackets++;
    if (char === ']') openBrackets--;
  }

  // Close any unclosed brackets/braces
  while (openBrackets > 0) {
    str += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    str += '}';
    openBraces--;
  }

  return str;
}

/**
 * Parse JSON with repair attempt on failure
 */
function parseJsonSafe(content: string): unknown {
  // First, try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  let jsonStr = jsonMatch[0];

  // Try parsing directly first
  try {
    return JSON.parse(jsonStr);
  } catch (firstError) {
    // Try repairing the JSON
    console.log('[parseJsonSafe] First parse failed, attempting repair...');
    try {
      const repaired = repairJson(jsonStr);
      return JSON.parse(repaired);
    } catch (secondError) {
      // Log the problematic JSON for debugging
      console.error('[parseJsonSafe] JSON repair failed. Content preview:');
      console.error(jsonStr.slice(0, 500) + '...');
      throw firstError;
    }
  }
}

// OpenRouter client (OpenAI-compatible API)
export const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'Investment Signal Monitor',
  },
});

// Model configuration - matching n8n workflow
// Pro model for heavy analysis/consolidation tasks
export const PRO_MODEL = 'google/gemini-3.1-pro-preview';
// Flash model for lighter tasks (quick digest, simple processing)
export const FLASH_MODEL = 'google/gemini-3-flash-preview';

// Types matching n8n workflow output structure
export interface Signal {
  type: 'bullish' | 'bearish' | 'monitor';
  ticker: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  action: string;
  timeHorizon: 'short' | 'medium' | 'long';
  catalyst: string;
  priceLevel: string;
}

export interface Catalyst {
  date: string;
  event: string;
  tickers: string[];
}

export interface AnalysisResult {
  signals: Signal[];
  key_insights: string[];
  overall_sentiment: 'bullish' | 'moderately_bullish' | 'neutral' | 'moderately_bearish' | 'bearish';
  summary: string;
  episodeHighlights: string[];
  riskAlerts: string[];
  catalysts: Catalyst[];
  podcastName: string;
}

// Legacy interface for backward compatibility
export interface LegacyAnalysisResult {
  summary: string;
  key_points: string[];
  stocks_mentioned: {
    ticker: string;
    name?: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    context: string;
  }[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
}

// System prompt matching n8n workflow "AI 投資分析 Agent"
const ANALYSIS_SYSTEM_PROMPT = `⚠️⚠️ 最重要規則：所有輸出內容必須 100% 使用繁體中文撰寫。
包括 summary、episodeHighlights、riskAlerts、key_insights 等所有文字欄位。
絕對不可以出現英文句子。股票代號（如 AAPL、TSLA）和公司專有名詞除外。

你是一位專業的財經分析師，專門分析中文和英文的投資 Podcast 及 YouTube 內容。即使轉錄文字是英文，所有輸出仍必須使用繁體中文。

⚠️ 重要：所有輸出內容必須使用繁體中文。

請仔細分析以下轉錄文字，針對每一集提取以下資訊：

## 擷取原則：
⚠️ 只收錄 KOL 有實質討論的個股，不要收錄僅被隨口提及的標的。
判斷標準：KOL 是否花了至少 2-3 句話以上分析該標的？是否有明確的看法、理由、操作建議或目標價？
如果 KOL 只是在列舉例子或順帶提到某支股票（如「像 AAPL 這種大型股...」），不要收錄為訊號。

## 擷取項目：

### 1. 看漲的個股（Bullish）
收錄所有「節目中提到且語境偏正面的個股」，包括：
- KOL/主持人明確看漲的個股
- KOL 正在研究、覺得值得關注的個股
- KOL 已持有且語氣正面的個股
- KOL 提到基本面正在改善的個股

每個訊號包含：
- 股票代號（ticker）
- 看漲理由（具體說明 KOL 的邏輯）
- 信心程度：
  - high: KOL 明確表態看好/看空、有具體目標價、已買入/賣出
  - medium: KOL 花了一段篇幅分析，有明確理由和邏輯
  - ⚠️ 不要收錄 low confidence（僅順帶提及）的訊號
- 時間框架（timeHorizon）：short/medium/long
- 催化劑（catalyst）：即將發生的事件。若無明確催化劑則留空字串。
- 具體價位（priceLevel）：KOL 提到的目標價、支撐位、壓力位等。若無則留空字串。

### 2. 看空的個股（Bearish）
收錄所有「節目中提到且語境偏負面的個股」，包括：
- KOL/主持人明確看空的個股
- KOL 認為估值過高、有風險的個股
- KOL 已賣出或減碼的個股
- KOL 提到基本面惡化的個股
- 同上所有欄位

### 3. KOL 提到的操作（僅供記錄）
- 記錄 KOL 自己的操作：已買進、已賣出、已加碼、已減碼、已停損、已停利
- 如果 KOL 只是表達看法而非實際操作，action 填「看好」「看空」「觀察」
- 絕對不要用命令式詞彙（買進/賣出/加碼/減碼），一律改為「已買進/已賣出」或「看好/看空」
- 請在 signal 中用 action 欄位記錄

### 4. 值得關注的產業趨勢或總經觀察（Monitor）
收錄範圍包括：
- 產業趨勢與板塊輪動
- 總經判斷（利率、通膨、GDP 等）
- 市場風向與資金流向觀察
- 地緣政治影響
- 同樣包含 timeHorizon 和 catalyst 欄位

### 5. KOL 的獨特觀點（key_insights）
收錄範圍包括：
- 與市場共識不同的看法
- 獨到的分析角度
- 對市場整體方向的判斷
- 任何有價值的觀察（即使不直接涉及個股）
- 投資策略與部位配置建議
- 請放在 key_insights 中

### 6. 每集重點摘要（episodeHighlights）
- 僅提供 3 個最核心的要點，每個要點限制在 15 字以內
- 使用關鍵詞式摘要，不要完整句子
- 目的是引起興趣讓用戶去聽原節目，不是替代原節目
- 例如："AI 基建支出看好" 而非 "KOL 認為 AI 基礎建設投資機會值得長期關注"

### 7. 風險提醒（riskAlerts）
- KOL 明確提到的風險警告
- 例如：估值風險、政策風險、技術面風險、流動性風險等
- 若無明確風險提醒則返回空陣列

### 8. 近期催化劑事件（catalysts）
- KOL 提到的即將發生的重要事件
- 包含日期、事件描述、影響的標的
- 若無則返回空陣列

## 分析原則：
- 只收錄 KOL 有花篇幅深入討論的標的
- 必須有明確理由（基本面、技術面、催化劑等）才收錄
- KOL 僅一兩句帶過的標的不要收錄
- 區分「有實質分析」vs「僅順帶提及」
- 區分「看好」與「已買入」的差別
- 如果 KOL 提到具體價位（目標價、停損價），請記錄在 priceLevel 欄位
- 如果轉錄內容與投資無關，返回空的 signals 陣列

## 輸出要求：
- 所有 reason、summary、key_insights、episodeHighlights、riskAlerts 必須用繁體中文撰寫
- ticker 欄位：美股保持代號（如 AAPL、TSLA）；台股請用「中文名 (代號)」格式（如「台積電 (2330)」、「聯發科 (2454)」），不要加 .TW 後綴
- ⚠️ 地區限制：只收錄美股和台股標的。不要收錄只在香港或中國A股上市的個股（如港股 .HK、滬股 .SH、深股 .SZ）。中國公司如果有在美國上市的 ADR（如 BABA、PDD、JD、BILI）則使用美股代號收錄。總經或產業趨勢提到中國市場是可以的。
- confidence 使用英文（high/medium/low）
- type 使用英文（bullish/bearish/monitor）
- timeHorizon 使用英文（short/medium/long）
- overall_sentiment 使用英文（bullish/moderately_bullish/neutral/moderately_bearish/bearish）
- action 欄位用繁體中文（已買進/已賣出/已加碼/已減碼/已停損/已停利/看好/看空/觀察/無）

⚠️ 輸出規則：
- 直接輸出純 JSON，不要用 \`\`\`json 包裹
- 不要在 JSON 前後加任何說明文字
- 確保 JSON 完整且可被解析`;

export async function analyzeTranscript(transcript: string, episodeTitle: string, podcastName?: string): Promise<AnalysisResult> {
  const response = await openrouter.chat.completions.create({
    model: PRO_MODEL,
    max_tokens: 6000,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: ANALYSIS_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: `Podcast: ${podcastName || 'Unknown'}
Episode: ${episodeTitle}

轉錄內容：
${transcript.slice(0, 40000)}`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';

  const result = parseJsonSafe(content) as AnalysisResult;
  result.podcastName = podcastName || 'Unknown';

  return result;
}

// Convert full analysis to legacy format for database storage
export function toLegacyFormat(analysis: AnalysisResult): LegacyAnalysisResult {
  const stocks_mentioned = analysis.signals
    .filter(s => s.type === 'bullish' || s.type === 'bearish')
    .map(s => ({
      ticker: s.ticker,
      sentiment: s.type === 'bullish' ? 'bullish' as const : 'bearish' as const,
      context: s.reason,
    }));

  // Map overall_sentiment to legacy format
  let sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' = 'neutral';
  if (analysis.overall_sentiment === 'bullish' || analysis.overall_sentiment === 'moderately_bullish') {
    sentiment = 'bullish';
  } else if (analysis.overall_sentiment === 'bearish' || analysis.overall_sentiment === 'moderately_bearish') {
    sentiment = 'bearish';
  } else if (analysis.signals.some(s => s.type === 'bullish') && analysis.signals.some(s => s.type === 'bearish')) {
    sentiment = 'mixed';
  }

  return {
    summary: analysis.summary,
    key_points: (analysis.episodeHighlights || []).slice(0, 5),
    stocks_mentioned,
    sentiment,
  };
}

// Consolidation prompt matching n8n workflow "AI 投資報告整合"
const CONSOLIDATION_SYSTEM_PROMPT = `⚠️⚠️ 語言規則（最高優先）：
- 所有文字內容必須使用繁體中文，包括 episodeSummaries 的 highlights、detailedSummary、oneLiner
- 即使原始輸入中有英文內容，也必須翻譯成繁體中文
- 唯一允許英文的場合：股票代號（AAPL）、公司名稱（Apple）、專有名詞（AI、ETF、Fed）

你是一位專業的投資報告整合師。你的任務是將多集節目的分析結果整合為一份完整、豐富且有價值的投資日報。

## 輸入格式：
你會收到一個 JSON，其中 analyses 陣列包含每集節目的分析結果，每個分析包含：
- signals: 個股訊號陣列（type: bullish/bearish/monitor）
- episodeHighlights: 節目重點
- riskAlerts: 風險提醒
- catalysts: 近期催化劑

## 整合原則：

### 1. 提取所有訊號到正確分類
⚠️ 必須遍歷每個 analysis 的 signals 陣列！
- type="bullish" 的訊號 → 放入 bullishSignals
- type="bearish" 的訊號 → 放入 bearishSignals
- type="monitor" 的訊號 → 放入 monitorSignals

### 2. 跨集數去重整合
- 同一支股票在不同節目被提到 → 合併為一個訊號，列出所有來源 KOL
- 註明每個 KOL 的具體觀點

### 3. 按重要性排序
- 多個 KOL 共同看好 > 單一 KOL 提到
- 有實際操作（買進/賣出）> 僅看好/看空
- high confidence > medium > low

### 4. 標記共識 vs 分歧
- 多個 KOL 同時看好同一標的 → consensus 填入「KOL 共識」
- KOL A 看多但 KOL B 看空同一標的 → 標記「KOL 分歧」並列出各方觀點

### 5. 完整保留所有訊號
⚠️ 不要過濾或移除任何訊號！即使是 monitor 類型也要保留！

## 輸出格式（嚴格遵守）：
{
  "date": "YYYY-MM-DD",
  "totalSources": 數字,
  "bullishSignals": [
    {
      "ticker": "股票代號（台股用「中文名 (代號)」如「台積電 (2330)」，美股用代號如 AAPL。⚠️ 只收錄美股和台股，不收錄港股/A股。中國公司有美股 ADR 的用美股代號如 BABA）",
      "consensus": "單一來源/KOL 共識/KOL 分歧",
      "sources": [
        { "kol": "來源名稱", "reason": "看漲理由", "action": "操作", "confidence": "high/medium/low" }
      ],
      "overallConfidence": "high/medium/low",
      "timeHorizon": "short/medium/long",
      "priceLevel": "目標價或空字串"
    }
  ],
  "bearishSignals": [同上格式],
  "monitorSignals": [
    { "topic": "主題", "reason": "原因", "mentionedBy": ["來源1"], "timeHorizon": "short/medium/long" }
  ],
  "keyInsights": ["觀點1", "觀點2"],
  "riskAlerts": ["風險1", "風險2"],
  "upcomingCatalysts": [{ "date": "日期", "event": "事件", "tickers": ["股票"] }],
  "episodeSummaries": [
    {
      "podcast": "節目名稱",
      "episode": "集數標題",
      "episodeLink": "連結",
      "sentiment": "bullish/bearish/neutral",
      "oneLiner": "一句話摘要",
      "detailedSummary": "詳細摘要",
      "highlights": ["重點1", "重點2"],
      "source": "podcast"
    }
  ]
}

⚠️ 輸出規則：
- 直接輸出純 JSON，不要用 \`\`\`json 包裹
- bullishSignals/bearishSignals/monitorSignals 必須從輸入的 signals 提取，不可為空（除非輸入真的沒有）
- ⚠️ episodeSummaries 是必填欄位！每一集節目都必須有摘要（oneLiner、detailedSummary、highlights）
- ⚠️ 看漲訊號最多保留 10 個，看空訊號最多保留 8 個（按重要性排序）
- 只保留有實質分析理由的訊號，沒有明確理由的不要收錄
- 將剩餘的歸入 monitorSignals
- ⚠️ keyInsights、riskAlerts 也必須填寫，從各集的分析中提取`;

export interface ConsolidatedReport {
  date: string;
  totalSources: number;
  bullishSignals: Array<{
    ticker: string;
    consensus: string;
    sources: Array<{
      kol: string;
      reason: string;
      action: string;
      confidence: string;
    }>;
    overallConfidence: string;
    timeHorizon: string;
    priceLevel: string;
  }>;
  bearishSignals: Array<{
    ticker: string;
    consensus: string;
    sources: Array<{
      kol: string;
      reason: string;
      action: string;
      confidence: string;
    }>;
    divergence: string;
    overallConfidence: string;
    timeHorizon: string;
    priceLevel: string;
  }>;
  monitorSignals: Array<{
    topic: string;
    reason: string;
    mentionedBy: string[];
    timeHorizon: string;
  }>;
  keyInsights: string[];
  riskAlerts: string[];
  upcomingCatalysts: Catalyst[];
  episodeSummaries: Array<{
    podcast: string;
    episode: string;
    episodeLink: string;
    sentiment: string;
    oneLiner: string;
    detailedSummary: string;
    highlights: string[];
    source: string;
  }>;
}

export async function consolidateReports(
  analyses: Array<{ analysis: AnalysisResult; episodeTitle: string; podcastName: string; episodeLink?: string }>
): Promise<ConsolidatedReport> {
  const inputData = {
    date: new Date().toISOString().split('T')[0],
    totalEpisodes: analyses.length,
    analyses: analyses.map(a => ({
      ...a.analysis,
      podcastName: a.podcastName,
      episodeTitle: a.episodeTitle,
      episodeLink: a.episodeLink || '',
    })),
  };

  const response = await openrouter.chat.completions.create({
    model: PRO_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: CONSOLIDATION_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: `今日日期: ${inputData.date}
分析集數: ${inputData.totalEpisodes}

以下是所有集數的分析結果 JSON：
${JSON.stringify(inputData, null, 2)}`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';

  const rawReport = parseJsonSafe(content) as Record<string, unknown>;
  return normalizeConsolidatedReport(rawReport, analyses.length);
}

/**
 * Normalize AI output to match ConsolidatedReport interface
 * Handles various field name variations from different AI model outputs
 */
function normalizeConsolidatedReport(raw: Record<string, unknown>, totalEpisodes: number): ConsolidatedReport {
  // Handle date variations
  const date = (raw.date || raw.reportDate || new Date().toISOString().split('T')[0]) as string;

  // Filter: only allow US and Taiwan tickers (block HK/CN-only stocks)
  function isAllowedTicker(ticker: string): boolean {
    const t = ticker.trim();
    // Explicit HK/CN exchange suffixes — blocked
    if (/\.(HK|SH|SZ)$/i.test(t)) return false;
    // Taiwan stocks: 中文名 (4+digit code) — allowed
    if (/[\u4e00-\u9fff].*\(\d{4,}\)/.test(t)) return true;
    // Pure uppercase letters (1-5 chars) = US ticker — allowed
    if (/^[A-Z]{1,5}$/.test(t)) return true;
    // Chinese characters without TW-style code = likely CN/HK stock — blocked
    if (/[\u4e00-\u9fff]/.test(t) && !/\(\d{4,}\)/.test(t)) return false;
    // Default: allow
    return true;
  }

  // Handle signal variations - AI might return consolidatedSignals instead of bullish/bearish arrays
  let bullishSignals: ConsolidatedReport['bullishSignals'] = [];
  let bearishSignals: ConsolidatedReport['bearishSignals'] = [];
  const monitorSignals: ConsolidatedReport['monitorSignals'] = [];

  // If AI returned separate arrays — filter out disallowed tickers
  if (Array.isArray(raw.bullishSignals)) {
    bullishSignals = (raw.bullishSignals as ConsolidatedReport['bullishSignals']).filter(s => isAllowedTicker(s.ticker));
  }
  if (Array.isArray(raw.bearishSignals)) {
    bearishSignals = (raw.bearishSignals as ConsolidatedReport['bearishSignals']).filter(s => isAllowedTicker(s.ticker));
  }
  if (Array.isArray(raw.monitorSignals)) {
    monitorSignals.push(...(raw.monitorSignals as ConsolidatedReport['monitorSignals']));
  }

  // If AI returned consolidated signals with direction field
  if (Array.isArray(raw.consolidatedSignals)) {
    for (const sig of raw.consolidatedSignals as Array<Record<string, unknown>>) {
      const direction = sig.direction as string || 'neutral';
      const normalizedSig = {
        ticker: (sig.ticker || sig.name || '') as string,
        consensus: (sig.consensusType || sig.consensus || '') as string,
        sources: Array.isArray(sig.sources) ? (sig.sources as Array<Record<string, unknown>>).map(s => ({
          kol: (s.kol || s.source || '') as string,
          reason: (s.reason || s.comment || '') as string,
          action: (s.action || '無') as string,
          confidence: (s.confidence || 'medium') as string,
        })) : [],
        overallConfidence: (sig.averageConfidence || sig.overallConfidence || 'medium') as string,
        timeHorizon: (sig.timeHorizon || 'medium') as string,
        priceLevel: (sig.priceLevel || '') as string,
        divergence: (sig.divergence || '') as string,
      };

      if (!isAllowedTicker(normalizedSig.ticker)) continue;

      if (direction === 'bullish' || (sig.sources as Array<Record<string, unknown>>)?.some(s => s.sentiment === 'bullish')) {
        bullishSignals.push(normalizedSig);
      } else if (direction === 'bearish' || (sig.sources as Array<Record<string, unknown>>)?.some(s => s.sentiment === 'bearish')) {
        bearishSignals.push(normalizedSig);
      } else {
        // Neutral signals go to monitor
        monitorSignals.push({
          topic: normalizedSig.ticker,
          reason: normalizedSig.sources.map(s => s.reason).join('; '),
          mentionedBy: normalizedSig.sources.map(s => s.kol),
          timeHorizon: normalizedSig.timeHorizon,
        });
      }
    }
  }

  // Normalize episode summaries
  const episodeSummaries: ConsolidatedReport['episodeSummaries'] = [];
  if (Array.isArray(raw.episodeSummaries)) {
    for (const ep of raw.episodeSummaries as Array<Record<string, unknown>>) {
      episodeSummaries.push({
        podcast: (ep.podcast || ep.podcastName || '') as string,
        episode: (ep.episode || ep.episodeTitle || '') as string,
        episodeLink: (ep.episodeLink || ep.link || '') as string,
        sentiment: (ep.sentiment || 'neutral') as string,
        oneLiner: (ep.oneLiner || '') as string,
        detailedSummary: (ep.detailedSummary || '') as string,
        highlights: Array.isArray(ep.highlights) ? ep.highlights as string[] : [],
        source: (ep.source || 'podcast') as string,
      });
    }
  }

  return {
    date,
    totalSources: totalEpisodes,
    bullishSignals,
    bearishSignals,
    monitorSignals,
    keyInsights: Array.isArray(raw.keyInsights) ? raw.keyInsights as string[] :
                 Array.isArray(raw.key_insights) ? raw.key_insights as string[] : [],
    riskAlerts: Array.isArray(raw.riskAlerts) ? raw.riskAlerts as string[] :
                Array.isArray(raw.risk_alerts) ? raw.risk_alerts as string[] : [],
    upcomingCatalysts: Array.isArray(raw.upcomingCatalysts) ? raw.upcomingCatalysts as Catalyst[] :
                       Array.isArray(raw.catalysts) ? raw.catalysts as Catalyst[] : [],
    episodeSummaries,
  };
}

// Quick digest prompt matching n8n workflow "AI 生成分析摘要"
export async function generateQuickDigest(report: ConsolidatedReport): Promise<{ quickDigest: string[]; marketMood: string }> {
  try {
    const response = await openrouter.chat.completions.create({
      model: PRO_MODEL,
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `你是一位專業的投資分析摘要師。你的任務是根據投資報告 JSON 生成兩段創意內容。

所有輸出必須使用繁體中文。

## 任務：

### 1. quickDigest（今日快速重點）
- 提供 3-5 個跨來源的重點 bullet points
- 每個 bullet 應精煉、有資訊密度，讓忙碌的投資者 5 秒內掌握今日重點
- 包含具體的股票代號或產業
- 即使報告內容較少，也要盡力提取重點

### 2. marketMood（市場氛圍一句話）
- 用一句話描述今日市場整體氛圍
- 例如：「AI 主題持續主導，但估值焦慮浮現」
- 要有洞察力，不要太泛泛

## 輸出格式（嚴格 JSON）：
{
  "quickDigest": ["重點1", "重點2", "重點3"],
  "marketMood": "一句話市場氛圍描述"
}

## 重要：
- 只輸出 JSON，不要有其他文字
- quickDigest 每個項目控制在 30 字以內
- marketMood 控制在 25 字以內
- 必須回傳有效的 JSON 格式`
        },
        {
          role: 'user',
          content: `以下是整合後的投資報告 JSON：
${JSON.stringify(report, null, 2)}`
        }
      ],
    });

    const content = response.choices[0]?.message?.content || '{}';
    console.log('[generateQuickDigest] Raw AI response:', content);

    const parsed = parseJsonSafe(content) as Record<string, unknown>;

    // Validate and ensure proper format
    return {
      quickDigest: Array.isArray(parsed.quickDigest) ? parsed.quickDigest :
                   Array.isArray(parsed.quick_digest) ? parsed.quick_digest : [],
      marketMood: typeof parsed.marketMood === 'string' ? parsed.marketMood :
                  typeof parsed.market_mood === 'string' ? parsed.market_mood : '',
    };
  } catch (error) {
    console.error('[generateQuickDigest] Error:', error);
    return generateFallbackQuickDigest(report);
  }
}

/**
 * Generate fallback quick digest from report data when AI fails
 */
function generateFallbackQuickDigest(report: ConsolidatedReport): { quickDigest: string[]; marketMood: string } {
  const quickDigest: string[] = [];

  // Extract from episode summaries
  for (const ep of report.episodeSummaries.slice(0, 3)) {
    if (ep.oneLiner) {
      quickDigest.push(ep.oneLiner);
    } else if (ep.highlights && ep.highlights.length > 0) {
      quickDigest.push(ep.highlights[0]);
    }
  }

  // If still empty, try signals
  if (quickDigest.length === 0) {
    for (const sig of [...report.bullishSignals, ...report.bearishSignals].slice(0, 3)) {
      if (sig.sources && sig.sources.length > 0) {
        quickDigest.push(`${sig.ticker}: ${sig.sources[0].reason.slice(0, 30)}`);
      }
    }
  }

  // Determine market mood based on signal counts
  let marketMood = '';
  const bullCount = report.bullishSignals.length;
  const bearCount = report.bearishSignals.length;

  if (bullCount > bearCount * 2) {
    marketMood = '市場情緒偏樂觀，多頭訊號明顯';
  } else if (bearCount > bullCount * 2) {
    marketMood = '市場情緒偏謹慎，風險意識抬頭';
  } else if (bullCount === 0 && bearCount === 0) {
    marketMood = '市場觀望氣氛濃厚，等待明確訊號';
  } else {
    marketMood = '多空看法分歧，建議審慎評估';
  }

  return { quickDigest, marketMood };
}
