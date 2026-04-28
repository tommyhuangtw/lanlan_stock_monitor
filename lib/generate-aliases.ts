/**
 * AI-powered stock alias generation
 *
 * Generates common search aliases for stocks so users can find them
 * by company name (e.g. "Google" → GOOGL, "台積電" → 2330.TW).
 */

import { openrouter, FLASH_MODEL } from './openrouter';
import { supabaseAdmin } from './supabase';
import { log } from './logger';
import { isTWStock, twTickerNumber } from './ticker-utils';

/**
 * Generate aliases for a stock using AI and save to database.
 */
export async function generateAndSaveAliases(
  stockId: number,
  tickerNormalized: string,
  name: string | null,
): Promise<string[]> {
  try {
    const aliases = await generateAliases(tickerNormalized, name);

    if (aliases.length > 0) {
      await supabaseAdmin
        .from('watchlist_stocks')
        .update({ aliases })
        .eq('id', stockId);

      log('info', `[generateAliases] ${tickerNormalized}: ${aliases.join(', ')}`);
    }

    return aliases;
  } catch (error) {
    log('error', `[generateAliases] Failed for ${tickerNormalized}: ${error}`);
    return [];
  }
}

async function generateAliases(
  tickerNormalized: string,
  name: string | null,
): Promise<string[]> {
  const market = isTWStock(tickerNormalized) ? 'TW' : 'US';
  const tickerNum = twTickerNumber(tickerNormalized);

  const prompt = market === 'TW'
    ? `股票代號 ${tickerNormalized}${name ? `（公司名：${name}）` : ''}。
請列出投資人可能用來搜尋這檔股票的常見別名。
包含：英文名稱、中文簡稱、完整公司名。
不要包含股票代號 ${tickerNum} 本身。
只回傳 JSON array，例如：["TSMC", "台積", "台積電"]`
    : `Stock ticker ${tickerNormalized}${name ? ` (company: ${name})` : ''}.
List common search aliases investors might use for this stock.
Include: full company name, Chinese name (繁體中文), common abbreviations, nicknames.
Do NOT include the ticker symbol "${tickerNormalized}" itself.
Return ONLY a JSON array, e.g. ["Google", "谷歌", "Alphabet"]`;

  const response = await openrouter.chat.completions.create({
    model: FLASH_MODEL,
    max_tokens: 200,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) return [];

  // Extract JSON array from response
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    // Filter: only strings, non-empty, not the ticker itself
    return parsed
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      .map(a => a.trim())
      .filter(a => a.toUpperCase() !== tickerNormalized.toUpperCase());
  } catch {
    log('warn', `[generateAliases] Failed to parse response for ${tickerNormalized}: ${content}`);
    return [];
  }
}
