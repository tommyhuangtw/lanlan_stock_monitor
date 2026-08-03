/**
 * Email Alert Notification Module
 *
 * Sends stock alert notifications via Resend (reusing existing infrastructure).
 */

import { Resend } from 'resend';
import { log } from '../logger';
import type { DetectionResult } from '../entry-point-detector';
import { supabaseAdmin } from '../supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * RESEND_FROM_EMAIL already carries its own display name
 * ("AI懶人報-懶懶財經速報 <digest@ailanbao.org>"), so pass it through as-is.
 * Wrapping it in another display name produces a nested address that Resend
 * rejects with a 422 non-ASCII error.
 */
function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'digest@ailanbao.org';
}

/**
 * Resolve the operator's alert address: notification_config first, ALERT_EMAIL as fallback.
 */
async function resolveAlertEmail(): Promise<string | null> {
  const { data: config } = await supabaseAdmin
    .from('notification_config')
    .select('email')
    .eq('user_identifier', 'tommy')
    .single();

  const email = config?.email || process.env.ALERT_EMAIL;
  if (!email) {
    log('warn', '[EmailAlert] No email configured for alerts');
    return null;
  }
  return email;
}

/**
 * Group recent failed transcription jobs by source name.
 * A source failing every episode (陽光財經 hit 114/114) is invisible in the
 * pipeline's own error list, because the transcriber marks those jobs failed
 * without pushing an error — so surface it here instead.
 */
async function recentTranscriptionFailures(hours = 36): Promise<string[]> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data: jobs } = await supabaseAdmin
    .from('transcription_jobs')
    .select('status, provider, episodes(source_id)')
    .gte('created_at', since);

  if (!jobs?.length) return [];

  const { data: sources } = await supabaseAdmin.from('sources').select('id, name');
  const nameById = new Map((sources || []).map(s => [s.id, s.name]));

  const tally = new Map<string, { ok: number; failed: number }>();
  for (const j of jobs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceId = (j.episodes as any)?.source_id;
    const name = nameById.get(sourceId) || '(未知來源)';
    const t = tally.get(name) || { ok: 0, failed: 0 };
    if (j.status === 'failed') t.failed++;
    else if (j.status === 'completed') t.ok++;
    tally.set(name, t);
  }

  return [...tally.entries()]
    .filter(([, t]) => t.failed > 0)
    .sort((a, b) => b[1].failed - a[1].failed)
    .map(([name, t]) => `${name}：失敗 ${t.failed} / 成功 ${t.ok}`);
}

/**
 * Email the operator when a scheduled job breaks.
 * Best-effort: never throws, so it can't take down the job it is reporting on.
 */
export async function sendPipelineAlert(opts: {
  job: string;
  headline: string;
  errors?: string[];
  includeTranscriptionFailures?: boolean;
}): Promise<boolean> {
  try {
    const email = await resolveAlertEmail();
    if (!email) return false;

    const failures = opts.includeTranscriptionFailures ? await recentTranscriptionFailures() : [];
    const time = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

    const block = (title: string, items: string[], bg: string) => items.length ? `
      <div style="margin-top:16px;padding:12px 16px;background:${bg};border-radius:8px;">
        <strong>${title}</strong>
        <ul style="margin:8px 0 0;padding-left:20px;font-family:ui-monospace,monospace;font-size:12px;">
          ${items.map(e => `<li style="margin-bottom:4px;">${escapeHtml(e)}</li>`).join('')}
        </ul>
      </div>` : '';

    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
        <h1 style="font-size:18px;margin:0;">🚨 ${escapeHtml(opts.job)} 執行異常</h1>
        <p style="color:#64748b;margin:4px 0 16px;font-size:13px;">${time}</p>
        <p style="margin:0;">${escapeHtml(opts.headline)}</p>
        ${block(`錯誤（${opts.errors?.length || 0}）`, opts.errors || [], '#fef2f2')}
        ${block('逐字稿失敗來源（近 36 小時）', failures, '#fffbeb')}
        <p style="margin-top:20px;color:#94a3b8;font-size:11px;">
          懶懶財經速報 — 系統監控通知。GitHub Actions 執行紀錄可查看完整 log。
        </p>
      </body></html>`;

    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: email,
      subject: `🚨 ${opts.job} 異常：${opts.headline.slice(0, 60)}`,
      html,
    });

    if (error) {
      log('error', `[PipelineAlert] Send failed: ${JSON.stringify(error)}`);
      return false;
    }
    log('info', `[PipelineAlert] Sent failure alert to ${email}`);
    return true;
  } catch (err) {
    log('error', `[PipelineAlert] Error: ${err}`);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/**
 * Generate a simple HTML email for stock alerts.
 */
function generateAlertHtml(results: DetectionResult[]): string {
  const date = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  const stockBlocks = results.map(result => {
    const marketFlag = result.market === 'US' ? '🇺🇸' : '🇹🇼';
    const snapshot = result.signals[0]?.technicalSnapshot;

    const signalRows = result.signals.map(signal => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">
          ${signal.triggerReason}
        </td>
      </tr>
    `).join('');

    const kolRows = (result.signals[0]?.kolContext || []).map(kol => `
      <li>${kol.kol}（${kol.date}）：${kol.reason.slice(0, 80)}</li>
    `).join('');

    return `
      <div style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">
          <strong style="font-size: 16px;">${marketFlag} ${result.ticker}</strong>
          ${snapshot ? `<span style="float: right; color: #64748b;">現價 ${snapshot.currentPrice.toFixed(2)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          ${signalRows}
        </table>
        ${kolRows ? `
          <div style="padding: 12px 16px; background: #fffbeb; border-top: 1px solid #fde68a;">
            <strong>📣 KOL 觀點：</strong>
            <ul style="margin: 4px 0 0; padding-left: 20px;">${kolRows}</ul>
          </div>
        ` : ''}
        ${snapshot ? `
          <div style="padding: 8px 16px; color: #64748b; font-size: 12px; border-top: 1px solid #eee;">
            RSI(14): ${snapshot.rsi14?.toFixed(1) ?? 'N/A'}
            ${snapshot.sma50 ? ` | SMA50: ${snapshot.sma50.toFixed(2)}` : ''}
            ${snapshot.sma200 ? ` | SMA200: ${snapshot.sma200.toFixed(2)}` : ''}
            ${result.trailingPE ? ` | PE(TTM): ${result.trailingPE.toFixed(1)}` : ''}
            ${result.forwardPE ? ` | 預估PE: ${result.forwardPE.toFixed(1)}` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 20px; margin: 0;">📊 股票觀察提醒</h1>
        <p style="color: #64748b; margin: 4px 0 0;">${date}</p>
      </div>

      ${stockBlocks}

      <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 8px; font-size: 12px; color: #92400e;">
        ⚠️ 以上為技術指標與 KOL 公開觀點彙整，僅供教育參考，非投資建議。投資有風險，請自行評估。
      </div>

      <div style="margin-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
        <p>懶懶財經速報 — 股票觀察系統</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send stock alert email via Resend.
 * Returns whether the email was sent successfully.
 */
export async function sendEmailAlert(detectionResults: DetectionResult[]): Promise<boolean> {
  if (detectionResults.length === 0) return false;

  const email = await resolveAlertEmail();
  if (!email) return false;

  const tickerList = detectionResults.map(r => r.ticker).join(', ');
  const subject = `📊 股票觀察提醒：${tickerList}`;
  const html = generateAlertHtml(detectionResults);

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: email,
      subject,
      html,
    });

    if (error) {
      log('error', `[EmailAlert] Send failed: ${JSON.stringify(error)}`);
      return false;
    }

    log('info', `[EmailAlert] Sent alert email to ${email} for ${detectionResults.length} stocks`);
    return true;
  } catch (error) {
    log('error', `[EmailAlert] Error: ${error}`);
    return false;
  }
}
