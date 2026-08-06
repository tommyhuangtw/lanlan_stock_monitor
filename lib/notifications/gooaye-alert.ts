/**
 * 股癌 (Gooaye) new-episode LINE push.
 *
 * Independent of the daily digest: the watcher runs off-schedule, and this
 * module decides whether the newest 股癌 episode still needs a push.
 * Dedupe is `episodes.line_pushed_at` — the digest never reads or writes it.
 */

import { supabaseAdmin } from '../supabase';
import { completeJson, PRO_MODEL, parseJsonSafe } from '../openrouter';
import { sendLineText } from './line';
import { log } from '../logger';

export const GOOAYE_SOURCE_ID = 'gooaye';

export interface GooayeBrief {
  oneLiner: string;
  /** 這集講到的個股／ETF 操作 */
  positions: Array<{
    ticker: string;
    name: string;
    view: 'bullish' | 'bearish' | 'neutral';
    action: string;
    level: string;
  }>;
  /** 這集對盤勢、產業的看法 */
  trends: string[];
  /** 操作心法：紀律、部位管理、心態 —— 不綁定個股 */
  playbook: string[];
}

const BRIEF_PROMPT = `⚠️ 所有輸出必須 100% 使用繁體中文（股票代號與公司專有名詞除外）。

你正在整理台灣財經 Podcast「股癌 Gooaye」最新一集的內容，給一位已經在操作美股與台股的投資人看。

請輸出 JSON：
{
  "oneLiner": "一句話總結這集（30 字內）",
  "positions": [
    {
      "ticker": "股票代號（美股用 AAPL；台股用 2330）",
      "name": "公司或標的名稱",
      "view": "bullish | bearish | neutral",
      "action": "主持人實際的操作或建議，例如「有加碼，但不追高」（40 字內）",
      "level": "有提到的價位、區間或條件，沒有就空字串"
    }
  ],
  "trends": ["這集對盤勢／產業／總經的看法，每則 50 字內，最多 5 則"],
  "playbook": ["操作心法：部位管理、進出場紀律、風險控制、心態，用他自己的說法轉述，每則 50 字內，最多 5 則"]
}

規則：
- positions 只收他有實質討論的標的（至少 2-3 句、有明確看法或操作），隨口提到的不要收。
- playbook 是最重要的一區，絕對不要留空：即使他沒有直說「心法」，也要從他描述自己怎麼買賣、怎麼看待風險與情緒的段落中萃取出來。
- 不要加入轉錄稿沒有的內容，寧可少寫也不要編。
- 廣告、業配、抽獎、閒聊一律略過。`;

/** Ask the model for the operations / trend / playbook breakdown of one episode. */
async function extractBrief(transcript: string, episodeTitle: string): Promise<GooayeBrief> {
  const content = await completeJson({
    model: PRO_MODEL,
    max_tokens: 8000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: BRIEF_PROMPT },
      { role: 'user', content: `Episode: ${episodeTitle}\n\n轉錄內容：\n${transcript.slice(0, 40000)}` },
    ],
  }, 'gooayeBrief');

  const brief = parseJsonSafe(content) as GooayeBrief;
  if (!Array.isArray(brief.positions)) brief.positions = [];
  if (!Array.isArray(brief.trends)) brief.trends = [];
  if (!Array.isArray(brief.playbook)) brief.playbook = [];
  return brief;
}

const VIEW_ICON = { bullish: '🟢', bearish: '🔴', neutral: '⚪' } as const;

/** Build the LINE text. Pure — the self-check in scripts/gooaye-watch.ts calls this directly. */
export function formatBrief(brief: GooayeBrief, episodeTitle: string, publishedAt: string): string {
  const d = new Date(publishedAt);
  const date = isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
  const out = [`🎙 股癌新集數${date ? `（${date}）` : ''}`, episodeTitle];

  if (brief.oneLiner) out.push('', `「${brief.oneLiner}」`);

  if (brief.positions.length > 0) {
    out.push('', '📌 操作整理');
    for (const p of brief.positions) {
      const head = [p.ticker, p.name].filter(Boolean).join(' ');
      out.push(`${VIEW_ICON[p.view] || '⚪'} ${head}`);
      out.push(`   ${p.action}${p.level ? `｜${p.level}` : ''}`);
    }
  }

  if (brief.trends.length > 0) {
    out.push('', '📈 近期趨勢');
    out.push(...brief.trends.map(t => `• ${t}`));
  }

  if (brief.playbook.length > 0) {
    out.push('', '🧠 操作心法');
    out.push(...brief.playbook.map(t => `• ${t}`));
  }

  return out.join('\n');
}

export interface GooayeAlertResult {
  pushed: boolean;
  reason: string;
  text?: string;
}

/**
 * Push the newest 股癌 episode to LINE, once.
 * @param opts.dryRun - build the message but neither send nor mark it pushed.
 * @param opts.force - re-push even if it was already sent.
 */
export async function sendGooayeAlert(opts: { dryRun?: boolean; force?: boolean } = {}): Promise<GooayeAlertResult> {
  const { data: episode } = await supabaseAdmin
    .from('episodes')
    .select('id, title, published_at, line_pushed_at, transcription_jobs ( transcript, status )')
    .eq('source_id', GOOAYE_SOURCE_ID)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!episode) return { pushed: false, reason: 'no 股癌 episode in the database' };
  if (episode.line_pushed_at && !opts.force) {
    return { pushed: false, reason: `already pushed at ${episode.line_pushed_at}` };
  }

  const jobs = (episode.transcription_jobs || []) as Array<{ transcript: string | null; status: string }>;
  const transcript = jobs.find(j => j.status === 'completed' && j.transcript)?.transcript;
  if (!transcript) return { pushed: false, reason: 'transcript not ready yet' };

  const brief = await extractBrief(transcript, episode.title || '');
  const text = formatBrief(brief, episode.title || '', episode.published_at);

  if (opts.dryRun) return { pushed: false, reason: 'dry run', text };

  const sent = await sendLineText(text);
  if (!sent) return { pushed: false, reason: 'LINE push failed', text };

  await supabaseAdmin
    .from('episodes')
    .update({ line_pushed_at: new Date().toISOString() })
    .eq('id', episode.id);

  log('info', `[gooaye] pushed episode ${episode.id} to LINE`);
  return { pushed: true, reason: 'sent', text };
}
