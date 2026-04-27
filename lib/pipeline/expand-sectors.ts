/**
 * Pipeline Step 4.6: Sector Expansion
 *
 * When KOLs mention a sector/theme (e.g. "光通股看好"), this module
 * uses Perplexity to search for specific stocks in that sector, then
 * uses Gemini to filter and add them to the watchlist.
 *
 * This step is NON-BLOCKING: if it fails, the pipeline continues.
 */

import { supabaseAdmin } from '../supabase';
import { openrouter, PRO_MODEL, SectorTheme } from '../openrouter';
import { normalizeTicker, isAllowedTicker } from '../ticker-utils';
import { log } from '../logger';

const PERPLEXITY_MODEL = 'perplexity/sonar-pro-search';
const EXPANSION_COOLDOWN_DAYS = 7;

export interface ExpandSectorsResult {
  themesProcessed: number;
  themesSkipped: number;
  stocksAdded: number;
  errors: string[];
}

/**
 * Expand sector themes from today's analyses into specific stocks.
 */
export async function expandSectors(): Promise<ExpandSectorsResult> {
  const results: ExpandSectorsResult = {
    themesProcessed: 0,
    themesSkipped: 0,
    stocksAdded: 0,
    errors: [],
  };

  // Get today's analyses that have sectorThemes
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const { data: analyses, error } = await supabaseAdmin
    .from('analyses')
    .select('full_analysis, episodes!inner(title, sources(name))')
    .gte('created_at', cutoff.toISOString());

  if (error || !analyses) {
    log('info', '[expandSectors] No recent analyses found');
    return results;
  }

  // Collect all sector themes from today
  const allThemes: Array<SectorTheme & { kol: string }> = [];

  for (const analysis of analyses) {
    const fullAnalysis = analysis.full_analysis as {
      sectorThemes?: SectorTheme[];
      podcastName?: string;
    } | null;

    if (!fullAnalysis?.sectorThemes) continue;

    const kol = fullAnalysis.podcastName || 'Unknown';
    for (const theme of fullAnalysis.sectorThemes) {
      if (theme.sentiment === 'bullish') {
        allThemes.push({ ...theme, kol });
      }
    }
  }

  if (allThemes.length === 0) {
    log('info', '[expandSectors] No bullish sector themes found today');
    return results;
  }

  log('info', `[expandSectors] Found ${allThemes.length} bullish sector themes`);

  // Deduplicate themes by name
  const uniqueThemes = new Map<string, Array<SectorTheme & { kol: string }>>();
  for (const theme of allThemes) {
    const key = theme.theme.toLowerCase().trim();
    if (!uniqueThemes.has(key)) {
      uniqueThemes.set(key, []);
    }
    uniqueThemes.get(key)!.push(theme);
  }

  for (const [, themes] of uniqueThemes) {
    const primaryTheme = themes[0];
    const todayStr = new Date().toISOString().split('T')[0];

    try {
      // Check cooldown
      const shouldSkip = await checkCooldown(primaryTheme.theme);
      if (shouldSkip) {
        results.themesSkipped++;
        log('info', `[expandSectors] Skipping "${primaryTheme.theme}" (recently expanded)`);
        continue;
      }

      // Search for stocks in this sector
      const stocks = await searchSectorStocks(primaryTheme.theme, primaryTheme.reason);

      if (stocks.length === 0) {
        log('info', `[expandSectors] No stocks found for "${primaryTheme.theme}"`);
        results.themesProcessed++;
        continue;
      }

      // Save expansion record
      const kolSources = themes.map(t => ({
        kol: t.kol,
        date: todayStr,
        reason: t.reason,
      }));

      await supabaseAdmin
        .from('sector_expansions')
        .upsert({
          theme: primaryTheme.theme,
          market: 'both',
          kol_source: themes.map(t => t.kol).join(', '),
          kol_sources: kolSources,
          search_query: `${primaryTheme.theme} 概念股`,
          stocks_found: stocks,
          expanded_at: new Date().toISOString(),
        }, { onConflict: 'theme,market' });

      // Add stocks to watchlist
      for (const stock of stocks) {
        try {
          const normalized = normalizeTicker(stock.ticker);
          if (!normalized) continue;

          // Check if already in watchlist
          const { data: existing } = await supabaseAdmin
            .from('watchlist_stocks')
            .select('id')
            .eq('ticker_normalized', normalized.normalized)
            .single();

          if (existing) continue; // Already tracked

          const { error: insertError } = await supabaseAdmin
            .from('watchlist_stocks')
            .insert({
              ticker: stock.ticker,
              ticker_normalized: normalized.normalized,
              market: normalized.market,
              name: stock.name || normalized.name,
              added_by: 'sector_expansion',
              sector_theme: primaryTheme.theme,
              sector_expansion_source: {
                theme: primaryTheme.theme,
                kol: primaryTheme.kol,
                date: todayStr,
                reason: stock.reason,
              },
              kol_sources: kolSources,
              consensus: themes.length > 1 ? '多方共識' : '單一來源',
            });

          if (!insertError) {
            results.stocksAdded++;
          }
        } catch (err) {
          results.errors.push(`Failed to add ${stock.ticker}: ${err}`);
        }
      }

      results.themesProcessed++;
      log('info', `[expandSectors] "${primaryTheme.theme}": found ${stocks.length} stocks, added ${results.stocksAdded}`);

    } catch (error) {
      results.errors.push(`Failed to expand "${primaryTheme.theme}": ${error}`);
      log('error', `[expandSectors] Error for "${primaryTheme.theme}": ${error}`);
    }
  }

  log('info', `[expandSectors] Done: ${results.themesProcessed} themes processed, ${results.stocksAdded} stocks added`);
  return results;
}

async function checkCooldown(theme: string): Promise<boolean> {
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - EXPANSION_COOLDOWN_DAYS);

  const { data } = await supabaseAdmin
    .from('sector_expansions')
    .select('expanded_at')
    .eq('theme', theme)
    .gte('expanded_at', cooldownDate.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

interface SectorStock {
  ticker: string;
  name: string;
  reason: string;
}

async function searchSectorStocks(theme: string, context: string): Promise<SectorStock[]> {
  // Step 1: Search with Perplexity
  const searchQuery = `${theme}概念股有哪些 台股 美股 2026 上市公司`;

  let searchResults: string;
  try {
    const response = await openrouter.chat.completions.create({
      model: PERPLEXITY_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是一位專業的股票分析師。請搜尋並列出相關概念股。用繁體中文回答。',
        },
        {
          role: 'user',
          content: `請列出「${theme}」相關的主要概念股，包括台股和美股。
背景：${context}

請列出每檔股票的：
1. 股票代號（台股格式：中文名 (代號)，美股格式：XXXX）
2. 公司名稱
3. 為什麼是${theme}概念股（一句話說明）

請列出 8-12 檔最直接受惠的股票。`,
        },
      ],
      temperature: 0,
      max_tokens: 1500,
    });

    searchResults = response.choices[0]?.message?.content || '';
  } catch (error) {
    log('error', `[searchSectorStocks] Perplexity search failed: ${error}`);
    return [];
  }

  if (!searchResults) return [];

  // Step 2: Use Gemini to extract and filter structured data
  try {
    const response = await openrouter.chat.completions.create({
      model: PRO_MODEL,
      messages: [
        {
          role: 'system',
          content: `你是一位專業的股票篩選專家。請從搜尋結果中篩選出最值得關注的概念股。
輸出純 JSON 陣列，不要用 \`\`\`json 包裹，不要加說明文字。`,
        },
        {
          role: 'user',
          content: `從以下「${theme}」概念股搜尋結果中，篩選出 5-8 檔最直接受惠且值得追蹤的個股。

篩選原則：
- 只保留台股和美股（不要港股、中國 A 股）
- 台股格式：「中文名 (代號)」（如「台積電 (2330)」）
- 美股格式：純英文代號（如「AAPL」）
- 排除市值過小或流動性不足的標的
- 優先選擇與「${theme}」最直接相關的公司

搜尋結果：
${searchResults}

請輸出 JSON 陣列格式：
[{"ticker": "台積電 (2330)", "name": "台灣積體電路", "reason": "全球最大晶圓代工廠"}]`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || '[]';

    // Parse JSON (handle common AI output issues)
    let parsed: SectorStock[];
    try {
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      log('warn', `[searchSectorStocks] Failed to parse Gemini response for "${theme}"`);
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    // Filter to allowed tickers only
    return parsed.filter(s => s.ticker && isAllowedTicker(s.ticker)).slice(0, 8);

  } catch (error) {
    log('error', `[searchSectorStocks] Gemini filtering failed: ${error}`);
    return [];
  }
}
