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

  // Get email from notification config
  const { data: config } = await supabaseAdmin
    .from('notification_config')
    .select('email')
    .eq('user_identifier', 'tommy')
    .single();

  const email = config?.email || process.env.ALERT_EMAIL;
  if (!email) {
    log('warn', '[EmailAlert] No email configured for alerts');
    return false;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'digest@ailanbao.org';
  const tickerList = detectionResults.map(r => r.ticker).join(', ');
  const subject = `📊 股票觀察提醒：${tickerList}`;
  const html = generateAlertHtml(detectionResults);

  try {
    const { error } = await resend.emails.send({
      from: `懶懶財經速報 <${fromEmail}>`,
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
