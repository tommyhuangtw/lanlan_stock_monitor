/**
 * Market Brief Module
 * Uses Perplexity (via OpenRouter) for search, Gemini for filtering/selection.
 */

import { openrouter } from './openrouter';

const PERPLEXITY_MODEL = 'perplexity/sonar-pro-search';
const SELECT_MODEL = 'google/gemini-3.1-pro-preview';
const MAX_RETRIES = 2;
const MIN_BULLETS = 4;
const MAX_BULLETS = 5;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isLast = attempt === MAX_RETRIES;
      const status = (error as { status?: number })?.status;
      const isRetryable = status === 429 || status === 500 || status === 502 || status === 503;
      if (isLast || !isRetryable) throw error;
      const delay = 1000 * Math.pow(2, attempt);
      console.warn(`[${label}] Attempt ${attempt + 1} failed (status ${status}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('unreachable');
}

// =============================================
// Daily Market Brief
// =============================================

export interface MarketBrief {
  content: string;
  citations: string[];
}

/** Filter out empty/placeholder bullets like "無重大情報" */
function isValidBullet(line: string): boolean {
  const text = line.replace(/^[•\-\*]\s*/, '').trim();
  return text.length > 20 && !/^(無|沒有|目前無|暫無|經查)/.test(text);
}

/** Extract bullet lines and citations from Perplexity raw response */
function parsePerplexityResponse(rawContent: string): { bullets: string[]; citations: string[] } {
  const urlRegex = /https?:\/\/[^\s)>\]]+/g;
  const urls = rawContent.match(urlRegex) || [];
  const citations = [...new Set(urls)].slice(0, 5);
  const bullets = rawContent
    .split('\n')
    .filter(l => /^[•\-\*]/.test(l.trim()))
    .filter(isValidBullet)
    .map(l => l.replace(/\[\d+\]/g, '').trim());
  return { bullets, citations };
}

/**
 * Step 1: Perplexity search for market news.
 * @param periodHours - 24 or 48
 */
async function searchMarketNews(periodHours: number): Promise<{ bullets: string[]; citations: string[] }> {
  const periodLabel = periodHours === 24 ? '24 小時' : '48 小時';
  const todayStr = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  const response = await withRetry(() => openrouter.chat.completions.create({
    model: PERPLEXITY_MODEL,
    messages: [
      {
        role: 'system',
        content: '你是一位專業的全球財經情報分析師，專門為台灣和美國的投資者篩選最有價值的財經情報。請搜尋最新資料，用繁體中文撰寫。直接從「• 」開始，不要寫任何前言、引言或開場白。每個重點用「• 」開頭，一行一個重點。',
      },
      {
        role: 'user',
        content: `今天是 ${todayStr}。請搜尋過去${periodLabel}內，對台股和美股投資者最重要的全球財經情報。

請提供 8 則重要新聞，涵蓋以下類型（不要報導個股漲跌或指數點數）：
1. 重大投資案、併購（M&A）、企業合作或策略聯盟
2. 關稅政策變動、貿易制裁、進出口法規調整
3. 各國央行利率決策、貨幣政策動向
4. 地緣政治事件（戰爭、軍事衝突、外交緊張）對市場的潛在影響
5. 美國政治動態（總統行政命令、國會法案、政策方向）
6. 日本、歐洲、中東、中國等地影響全球市場的重大事件
7. 重要經濟數據發布（就業、通膨、GDP等）
8. 產業重大變動、科技法規、AI 政策等

格式要求：
- 格式嚴格為：「• **簡短標題（YYYY/M/D）**：詳細說明」
- ⚠️⚠️ 每個重點的標題中「必須」包含該新聞實際發生或發布的日期，格式為全形括號（YYYY/M/D），例如（2026/2/24）。不要省略年份。沒有日期的重點將被自動丟棄。
- 日期必須是該新聞實際發生或發布的日期，不要用今天的日期代替。
- 標題 5-10 字，概括這則消息的主題
- 每則消息說明「發生了什麼」+「對投資者的潛在影響」
- 務必提供 8 個重點
- 不要報導個股股價漲跌（這些用戶自己看得到）
- 除了標題的 ** 標記外，不要用其他 markdown 格式
- 嚴禁寫任何開頭引言、前言、總結語。第一個字必須是「• 」
- 優先選擇對投資決策有實際影響的消息`,
      },
    ],
    temperature: 0,
    max_tokens: 1200,
  }), `MarketBrief:${periodHours}h`);

  const rawContent = response.choices[0]?.message?.content || '';
  return parsePerplexityResponse(rawContent);
}

/** Extract date from bullet title like （2026/2/24） or （2026/2/25-26） */
function extractDateFromBullet(bullet: string): Date | null {
  const match = bullet.match(/[（(](\d{4})\/(\d{1,2})\/(\d{1,2})(?:-\d{1,2})?[）)]/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** Check if a date is within the last N hours from now */
function isWithinHours(date: Date, hours: number): boolean {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return diffMs >= 0 && diffMs <= hours * 60 * 60 * 1000;
}

/**
 * Step 1.5: Filter bullets by recency using regex date extraction.
 * Bullets without a parseable date are discarded (prompt requires dates).
 */
function filterByRecency(bulletLines: string[]): string[] {
  if (bulletLines.length === 0) return [];

  return bulletLines.filter(bullet => {
    const date = extractDateFromBullet(bullet);
    if (!date) {
      console.log(`[MarketBrief] Filtered out (no date found): ${bullet.slice(0, 60)}...`);
      return false;
    }
    const recent = isWithinHours(date, 48);
    if (!recent) {
      console.log(`[MarketBrief] Filtered out (old date): ${bullet.slice(0, 60)}...`);
    }
    return recent;
  });
}

/** Remove date annotations like （2026/2/24） or (2026/2/24) from bullet titles */
function stripDateFromTitle(line: string): string {
  return line.replace(/[（(]\d{4}\/\d{1,2}\/\d{1,2}(?:-\d{1,2})?[）)]/g, '').replace(/\s{2,}/g, ' ');
}

/**
 * Step 3: Use Gemini Pro to select and output the top 3-5 bullet points directly.
 */
async function selectTopBullets(bulletLines: string[]): Promise<string[]> {
  if (bulletLines.length <= MIN_BULLETS) return bulletLines.map(stripDateFromTitle);
  try {
    const response = await openrouter.chat.completions.create({
      model: SELECT_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是一位服務台灣與美國投資者的資深財經編輯。你的讀者是活躍的股票投資人，他們需要快速掌握會影響投資決策和風險判斷的國際情報。請直接輸出篩選後的重點，不要加任何前言或說明。',
        },
        {
          role: 'user',
          content: `以下是今日候選財經新聞，請從中挑出對台美股投資者最重要的 ${MIN_BULLETS} 到 ${MAX_BULLETS} 條，按重要性從高到低排列。

篩選優先級（高→低）：
1. 會直接影響台股或美股走勢的政策/事件（關稅、制裁、央行利率、重大法規）
2. 改變產業格局的事件（重大併購、供應鏈重組、技術突破、AI 政策）
3. 影響資金流向的總經數據或地緣政治風險（通膨、就業、軍事衝突、外交危機）
4. 國際政治動態對市場的連鎖效應（貿易談判、外交訪問、國會法案）

篩選原則：
- 優先選擇「會改變投資人行為」的新聞，而非單純的資訊更新
- 同類型新聞只保留最重要的一條，確保涵蓋面廣
- 排除純粹的市場回顧（昨日漲跌），聚焦前瞻性情報

格式：「• **標題**：說明」
⚠️ 標題中不要包含日期（去掉括號中的日期），直接寫標題內容。
⚠️ 所有重點的總字數不得超過 550 字。每條說明控制在 1-2 句話內。

候選新聞：
${bulletLines.join('\n')}`,
        },
      ],
      temperature: 0,
      max_tokens: 800,
    });
    const content = response.choices[0]?.message?.content || '';
    const selected = content
      .split('\n')
      .filter(l => /^[•\-\*]/.test(l.trim()))
      .filter(l => l.trim().length > 20);

    if (selected.length >= MIN_BULLETS) {
      return selected.slice(0, MAX_BULLETS).map(stripDateFromTitle);
    }
    // Fallback
    return bulletLines.slice(0, MAX_BULLETS).map(stripDateFromTitle);
  } catch (error) {
    console.warn('[MarketBrief] Selection failed, taking first bullets:', error);
    return bulletLines.slice(0, MAX_BULLETS).map(stripDateFromTitle);
  }
}

/** Deduplicate bullets by comparing their text content (strip leading bullet chars) */
function deduplicateBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  return bullets.filter(b => {
    const key = b.replace(/^[•\-\*]\s*/, '').trim().slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generate a daily market brief:
 * 1. Two Perplexity searches (24h each, different results each time)
 * 2. Merge → dedup → regex date filter
 * 3. selectTopBullets — Gemini Pro picks top 4-5
 */
export async function generateMarketBrief(): Promise<MarketBrief> {
  try {
    // Step 1: First Perplexity search (24h)
    console.log('[MarketBrief] Step 1: First 24h search...');
    const { bullets: raw1, citations: citations1 } = await searchMarketNews(24);
    console.log(`[MarketBrief] Got ${raw1.length} bullets from first search`);

    // Step 2: Second Perplexity search (24h)
    console.log('[MarketBrief] Step 2: Second 24h search...');
    const { bullets: raw2, citations: citations2 } = await searchMarketNews(24);
    console.log(`[MarketBrief] Got ${raw2.length} bullets from second search`);

    // Step 3: Merge → dedup → regex date filter
    const allRaw = deduplicateBullets([...raw1, ...raw2]);
    console.log(`[MarketBrief] Step 3: ${allRaw.length} unique bullets after merge`);
    const allFiltered = filterByRecency(allRaw);
    console.log(`[MarketBrief] ${allFiltered.length} bullets confirmed recent`);
    const allCitations = [...new Set([...citations1, ...citations2])].slice(0, 5);

    // Step 4: Gemini Pro select top 4-5
    console.log(`[MarketBrief] Step 4: Selecting top ${MIN_BULLETS}-${MAX_BULLETS} from ${allFiltered.length} candidates...`);
    const finalBullets = await selectTopBullets(allFiltered);
    console.log(`[MarketBrief] Final: ${finalBullets.length} bullets selected`);

    return { content: finalBullets.join('\n'), citations: allCitations };
  } catch (error) {
    console.error('[MarketBrief] Failed:', error);
    return { content: '', citations: [] };
  }
}
