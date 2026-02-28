/**
 * Test script: Send simulated day 0-8 emails to preview the full trial flow.
 * Usage: npx tsx --env-file=.env scripts/test-email-flow.ts
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { injectMagicLinkToHtml } from '../lib/email-generator';

const TARGET_EMAIL = 'tommyhuang511@gmail.com';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const upgradeUrl = `${baseUrl}/upgrade`;
const fakeMagicLink = `${baseUrl}/auth/verify?token=test-token-preview`;
const fakeUnsubUrl = `${baseUrl}/api/unsubscribe?token=test-token-preview`;

// ---- Helper: fetch latest digest HTML from DB ----
async function getLatestDigestHtml(): Promise<string | null> {
  const { data } = await supabase
    .from('daily_digests')
    .select('html_template')
    .eq('status', 'completed')
    .order('digest_date', { ascending: false })
    .limit(1)
    .single();
  return data?.html_template || null;
}

// ---- Helper: fetch source names ----
async function getSourceNames(): Promise<string> {
  const { data } = await supabase
    .from('sources')
    .select('name')
    .eq('is_active', true);
  return data?.map(s => s.name).join('、') || '全部來源';
}

// ---- Welcome header (same as signup route) ----
function buildWelcomeHeader(sourceNames: string): string {
  return `
    <div style="text-align: center; margin-bottom: 32px;">
      <img src="${process.env.NEXT_PUBLIC_APP_URL || 'https://ailanbao.org'}/icon.png" width="48" height="48" alt="懶懶財經速報" style="border-radius:10px;display:inline-block;margin-bottom:16px;" />
      <h1 style="color: #FFFFFF; font-size: 24px; margin: 0 0 8px 0;">歡迎加入 懶懶財經速報！</h1>
      <p style="color: #CBD5E1; font-size: 14px; margin: 0;">你的 AI 投資 Podcast 及 YouTube 摘要助手</p>
    </div>
    <div style="margin-bottom: 24px;">
      <p style="color: #FFFFFF; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">接下來會發生什麼？</p>
      <div style="border-left: 2px solid #475569; padding-left: 20px; margin-left: 8px;">
        <div style="margin-bottom: 16px;">
          <p style="color: #10B981; font-size: 14px; font-weight: 600; margin: 0;">現在</p>
          <p style="color: #CBD5E1; font-size: 14px; margin: 4px 0 0 0;">你已成功註冊！以下是最新一期的投資摘要</p>
        </div>
        <div style="margin-bottom: 16px;">
          <p style="color: #F59E0B; font-size: 14px; font-weight: 600; margin: 0;">前 7 天</p>
          <p style="color: #CBD5E1; font-size: 14px; margin: 4px 0 0 0;">每天收到最新摘要（免費體驗）</p>
        </div>
        <div>
          <p style="color: #94A3B8; font-size: 14px; font-weight: 600; margin: 0;">第 8 天起</p>
          <p style="color: #94A3B8; font-size: 14px; margin: 4px 0 0 0;">免費版改為每週一封・<a href="${upgradeUrl}" style="color: #F59E0B; text-decoration: none;">升級專業版</a>可繼續每天收到</p>
        </div>
      </div>
    </div>
    <div style="background-color: #0F172A; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="color: #CBD5E1; font-size: 14px; margin: 0 0 8px 0;">我們幫你追蹤的來源：</p>
      <p style="color: #F59E0B; font-size: 16px; font-weight: 600; margin: 0;">${sourceNames}</p>
    </div>
    <div style="display: flex; align-items: center; margin-bottom: 24px;">
      <div style="flex: 1; height: 1px; background-color: #475569;"></div>
      <span style="color: #94A3B8; font-size: 12px; padding: 0 12px; text-transform: uppercase; letter-spacing: 1px;">最新摘要</span>
      <div style="flex: 1; height: 1px; background-color: #475569;"></div>
    </div>
  `;
}

function injectWelcomeHeader(digestHtml: string, sourceNames: string): string {
  const header = buildWelcomeHeader(sourceNames);
  const injectionPoint = digestHtml.indexOf('<!-- Header -->');
  if (injectionPoint !== -1) {
    return digestHtml.slice(0, injectionPoint) + header + digestHtml.slice(injectionPoint);
  }
  const bodyMatch = digestHtml.match(/<body[^>]*>[\s\S]*?<div[^>]*>[\s\S]*?<div[^>]*>/);
  if (bodyMatch) {
    const insertPos = bodyMatch.index! + bodyMatch[0].length;
    return digestHtml.slice(0, insertPos) + header + digestHtml.slice(insertPos);
  }
  return header + digestHtml;
}

// ---- Trial CTA (same as send-emails.ts) ----
function generateTrialCta(daysSinceSignup: number): string {
  const daysLeft = 7 - daysSinceSignup;
  const NT = 'NT';

  let headline: string;
  let footnote = '';

  if (daysLeft <= 1) {
    headline = '最後一天！優惠價即將結束';
    footnote = '<p style="color: #6B7280; font-size: 11px; margin: 10px 0 0 0;">明天起升級價格恢復為 ' + NT + '$199/月</p>';
  } else {
    headline = '限時優惠還剩 ' + daysLeft + ' 天';
  }

  return '<div style="padding: 16px 20px;">'
    + '<div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.06)); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 20px; text-align: center;">'
    + '<p style="color: #D97706; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">' + headline + '</p>'
    + '<p style="color: #1E293B; font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">'
    + '<span style="text-decoration: line-through; color: #9CA3AF; font-size: 14px; font-weight: 400; margin-right: 8px;">' + NT + '$199/月</span>'
    + NT + '$99/月</p>'
    + '<p style="color: #64748B; font-size: 13px; margin: 0 0 14px 0;">升級專業版，繼續每天收到最新摘要</p>'
    + '<a href="' + upgradeUrl + '" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 600; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px;">'
    + NT + '$99/月 升級專業版 →</a>'
    + footnote
    + '</div></div>';
}

// ---- Trial-end email (same as send-emails.ts) ----
function generateTrialEndEmail(): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0F172A; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #1E293B; border-radius: 16px; padding: 40px; border: 1px solid #475569;">
    <div style="text-align: center; margin-bottom: 32px;">
      <img src="${process.env.NEXT_PUBLIC_APP_URL || 'https://ailanbao.org'}/icon.png" width="48" height="48" alt="懶懶財經速報" style="border-radius:10px;display:inline-block;margin-bottom:16px;" />
      <h1 style="color: #FFFFFF; font-size: 22px; margin: 0 0 8px 0;">你的每日摘要體驗已結束</h1>
      <p style="color: #CBD5E1; font-size: 14px; margin: 0;">過去 7 天，你每天都收到了最新的投資摘要</p>
    </div>
    <div style="background-color: #0F172A; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="color: #FFFFFF; font-size: 15px; font-weight: 600; margin: 0 0 12px 0;">從今天起有什麼不同？</p>
      <div style="display: flex; margin-bottom: 8px;">
        <span style="color: #EF4444; margin-right: 8px;">✕</span>
        <p style="color: #CBD5E1; font-size: 14px; margin: 0;">不再每天收到摘要</p>
      </div>
      <div style="display: flex;">
        <span style="color: #10B981; margin-right: 8px;">✓</span>
        <p style="color: #CBD5E1; font-size: 14px; margin: 0;">改為每週三收到一封週報</p>
      </div>
    </div>
    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #FBBF24; font-size: 13px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">限時優惠</p>
      <p style="color: #FFFFFF; font-size: 18px; font-weight: 700; margin: 0 0 4px 0;"><span style="text-decoration: line-through; color: #94A3B8; font-size: 14px; font-weight: 400; margin-right: 8px;">NT$199/月</span>前兩個月只要 NT$99/月</p>
      <p style="color: #CBD5E1; font-size: 13px; margin: 0 0 16px 0;">升級專業版，繼續每天收到最新投資摘要</p>
      <a href="${upgradeUrl}" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
        立即升級 - NT$99/月 →
      </a>
      <p style="color: #94A3B8; font-size: 11px; margin: 12px 0 0 0;">錯過優惠後，升級價格為 NT$199/月</p>
    </div>
    <hr style="border: none; border-top: 1px solid #475569; margin: 24px 0;">
    <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">
      懶懶財經速報 - AI 自動摘要投資 Podcast 及 YouTube<br>
      <a href="${fakeMagicLink}" style="color: #94A3B8; text-decoration: underline;">管理訂閱</a>
      &nbsp;·&nbsp;
      <a href="${fakeUnsubUrl}" style="color: #94A3B8; text-decoration: underline;">取消訂閱</a>
    </p>
  </div>
</body>
</html>`;
}

// ---- Main ----
async function main() {
  console.log('Fetching latest digest and source names...');
  const [digestHtml, sourceNames] = await Promise.all([
    getLatestDigestHtml(),
    getSourceNames(),
  ]);

  if (!digestHtml) {
    console.error('No completed digest found in database. Cannot send test emails.');
    process.exit(1);
  }

  // Prepare base digest with fake magic link
  const baseDigest = injectMagicLinkToHtml(digestHtml, fakeMagicLink, fakeUnsubUrl);
  const today = new Date().toISOString().split('T')[0];

  const emails: { day: number; subject: string; html: string }[] = [];

  // Day 0: Welcome email (welcome header + digest)
  const welcomeHtml = injectWelcomeHeader(baseDigest, sourceNames);
  emails.push({
    day: 0,
    subject: `[Day 0 - 歡迎] 歡迎加入懶懶財經速報！`,
    html: welcomeHtml,
  });

  // Days 1-6: Daily email with trial CTA at top
  for (let day = 1; day <= 6; day++) {
    const daysLeft = 7 - day;

    let emailHtml = baseDigest;
    const trialCta = generateTrialCta(day);
    emailHtml = emailHtml.replace('<!-- CTA_INJECTION_POINT -->', trialCta);

    const subjectSuffix = daysLeft <= 1
      ? '（最後一天！）'
      : `（免費體驗還剩 ${daysLeft} 天）`;

    emails.push({
      day,
      subject: `[Day ${day}] 今日懶懶財經速報 - ${today}${subjectSuffix}`,
      html: emailHtml,
    });
  }

  // Day 7: Trial-end email
  emails.push({
    day: 7,
    subject: `[Day 7 - 試用結束] 你的每日摘要體驗已結束`,
    html: generateTrialEndEmail(),
  });

  // Day 8: Weekly email (no trial CTA, just the digest)
  emails.push({
    day: 8,
    subject: `[Day 8 - 週報] 本週懶懶財經速報 - ${today}`,
    html: baseDigest,
  });

  // Send all emails with delays
  console.log(`Sending ${emails.length} test emails to ${TARGET_EMAIL}...\n`);

  for (const email of emails) {
    try {
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: TARGET_EMAIL,
        subject: email.subject,
        html: email.html,
      });

      if (error) {
        console.error(`  ✗ Day ${email.day}: ${error.message}`);
      } else {
        console.log(`  ✓ Day ${email.day}: ${email.subject}`);
      }
    } catch (e) {
      console.error(`  ✗ Day ${email.day}: ${e}`);
    }

    // 1 second delay between sends
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\nDone! Check your inbox.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
