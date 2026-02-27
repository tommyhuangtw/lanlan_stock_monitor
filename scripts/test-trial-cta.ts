/**
 * Send 5 test emails simulating different trial countdown days.
 * Usage: npx tsx scripts/test-trial-cta.ts
 */
import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';
import { injectMagicLinkToHtml } from '../lib/email-generator';
import { formatDateTaipei } from '../lib/digest-cache';
import { Resend } from 'resend';

const TARGET_EMAIL = 'tommyhuang511@gmail.com';
const resend = new Resend(process.env.RESEND_API_KEY);

// Copy of generateTrialCta from send-emails.ts (not exported)
function generateTrialCta(daysSinceSignup: number, upgradeUrl: string): string {
  const daysLeft = 7 - daysSinceSignup;
  const NT = 'NT';

  let headline: string;
  let footnote = '';
  let bgGradient: string;
  let borderColor: string;
  let headlineColor: string;
  let btnBg: string;
  let btnTextColor: string;

  if (daysLeft <= 1) {
    headline = '⚠ 最後一天！優惠價即將結束';
    footnote = '<p style="color: #6B7280; font-size: 11px; margin: 10px 0 0 0;">明天起升級價格恢復為 ' + NT + '$199/月</p>';
    bgGradient = 'rgba(239, 68, 68, 0.12), rgba(220, 38, 38, 0.06)';
    borderColor = 'rgba(239, 68, 68, 0.4)';
    headlineColor = '#EF4444';
    btnBg = '#EF4444';
    btnTextColor = '#FFFFFF';
  } else if (daysLeft <= 3) {
    headline = '⏰ 優惠即將結束，還剩 ' + daysLeft + ' 天';
    bgGradient = 'rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.06)';
    borderColor = 'rgba(245, 158, 11, 0.3)';
    headlineColor = '#D97706';
    btnBg = '#F59E0B';
    btnTextColor = '#0F172A';
  } else {
    headline = '限時優惠還剩 ' + daysLeft + ' 天';
    bgGradient = 'rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.06)';
    borderColor = 'rgba(245, 158, 11, 0.3)';
    headlineColor = '#D97706';
    btnBg = '#F59E0B';
    btnTextColor = '#0F172A';
  }

  return '<div style="padding: 16px 20px;">'
    + '<div style="background: linear-gradient(135deg, ' + bgGradient + '); border: 1px solid ' + borderColor + '; border-radius: 12px; padding: 20px; text-align: center;">'
    + '<p style="color: ' + headlineColor + '; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">' + headline + '</p>'
    + '<p style="color: #1E293B; font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">'
    + '<span style="text-decoration: line-through; color: #9CA3AF; font-size: 14px; font-weight: 400; margin-right: 8px;">' + NT + '$199/月</span>'
    + NT + '$99/月</p>'
    + '<p style="color: #64748B; font-size: 13px; margin: 0 0 14px 0;">升級專業版，繼續每天收到最新摘要</p>'
    + '<a href="' + upgradeUrl + '" style="display: inline-block; background-color: ' + btnBg + '; color: ' + btnTextColor + '; font-weight: 600; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px;">'
    + NT + '$99/月 升級專業版 →</a>'
    + footnote
    + '</div></div>';
}

function getSubject(daysSinceSignup: number, dateStr: string): string {
  const daysLeft = 7 - daysSinceSignup;
  if (daysLeft <= 1) {
    return `⚠ 今日懶懶財經速報 - ${dateStr}（限時優惠最後一天！）`;
  } else if (daysLeft <= 3) {
    return `⏰ 今日懶懶財經速報 - ${dateStr}（限時優惠倒數 ${daysLeft} 天）`;
  } else {
    return `今日懶懶財經速報 - ${dateStr}（還剩 ${daysLeft} 天）`;
  }
}

async function main() {
  // Get latest completed digest
  const { data: digest, error } = await supabaseAdmin
    .from('daily_digests')
    .select('*')
    .eq('status', 'completed')
    .order('digest_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !digest) {
    console.error('No completed digest found:', error?.message);
    process.exit(1);
  }

  console.log(`Using digest #${digest.id} from ${digest.digest_date}\n`);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const upgradeUrl = `${baseUrl}/upgrade`;
  const dummyMagicLink = `${baseUrl}/dashboard`;
  const dummyUnsubscribe = `${baseUrl}/api/unsubscribe?token=test`;
  const dateStr = formatDateTaipei(new Date());

  // 5 test scenarios: daysSinceSignup values
  const scenarios = [
    { daysSinceSignup: 0, label: 'Day 0 (daysLeft=7, orange normal)' },
    { daysSinceSignup: 3, label: 'Day 3 (daysLeft=4, orange normal)' },
    { daysSinceSignup: 4, label: 'Day 4 (daysLeft=3, orange + ⏰)' },
    { daysSinceSignup: 5, label: 'Day 5 (daysLeft=2, orange + ⏰)' },
    { daysSinceSignup: 6, label: 'Day 6 (daysLeft=1, RED + ⚠)' },
  ];

  for (const scenario of scenarios) {
    const trialCta = generateTrialCta(scenario.daysSinceSignup, upgradeUrl);
    let emailHtml = injectMagicLinkToHtml(digest.html_template, dummyMagicLink, dummyUnsubscribe);
    emailHtml = emailHtml.replace('<!-- CTA_INJECTION_POINT -->', trialCta);

    const subject = `[TEST] ${getSubject(scenario.daysSinceSignup, dateStr)}`;

    const { data: result, error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: TARGET_EMAIL,
      subject,
      html: emailHtml,
    });

    if (sendError) {
      console.error(`FAILED: ${scenario.label} - ${sendError.message}`);
    } else {
      console.log(`SENT: ${scenario.label}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Resend ID: ${result?.id}\n`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('Done! Check your inbox at', TARGET_EMAIL);
}

main().catch(console.error);
