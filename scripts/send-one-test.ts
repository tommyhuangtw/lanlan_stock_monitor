/**
 * Send one test email from the latest cached digest, bypassing emailSent check.
 * Usage: npx tsx scripts/send-one-test.ts
 */
import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';
import { injectMagicLinkToHtml } from '../lib/email-generator';
import { Resend } from 'resend';
import crypto from 'crypto';

const TARGET_EMAIL = 'tommyhuang0511@gmail.com';

async function main() {
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Get latest completed digest
  const { data: digest, error: digestError } = await supabaseAdmin
    .from('daily_digests')
    .select('*')
    .eq('status', 'completed')
    .order('digest_date', { ascending: false })
    .limit(1)
    .single();

  if (digestError || !digest) {
    console.error('No completed digest found:', digestError?.message);
    process.exit(1);
  }

  console.log(`Found digest #${digest.id} for date ${digest.digest_date}`);

  // Find or create user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', TARGET_EMAIL)
    .single();

  if (!user) {
    console.error('User not found:', TARGET_EMAIL);
    process.exit(1);
  }

  // Create magic link
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await supabaseAdmin.from('magic_links').insert({
    user_id: user.id,
    token,
    expires_at: expiresAt.toISOString(),
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const magicLinkUrl = `${baseUrl}/auth/verify?token=${token}`;
  const unsubscribeUrl = `${baseUrl}/api/unsubscribe?token=${token}`;

  // Inject links into HTML
  let emailHtml = injectMagicLinkToHtml(digest.html_template, magicLinkUrl, unsubscribeUrl);

  // Inject trial CTA
  const daysSinceSignup = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (!user.is_paid && daysSinceSignup < 7) {
    const daysLeft = 7 - daysSinceSignup;
    const NT = 'NT';
    const upgradeUrl = `${baseUrl}/upgrade`;
    let headline = '限時優惠還剩 ' + daysLeft + ' 天';
    let footnote = '';
    if (daysLeft <= 1) {
      headline = '最後一天！優惠價即將結束';
      footnote = '<p style="color: #6B7280; font-size: 11px; margin: 10px 0 0 0;">明天起升級價格恢復為 ' + NT + '$199/月</p>';
    }

    const trialCta = '<div style="padding: 16px 20px;">'
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

    emailHtml = emailHtml.replace('<!-- CTA_INJECTION_POINT -->', trialCta);
  }

  // Send
  const subject = `[測試] 今日懶懶財經速報 - ${digest.digest_date}`;
  const { data: result, error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to: TARGET_EMAIL,
    subject,
    html: emailHtml,
  });

  if (sendError) {
    console.error('Send failed:', sendError.message);
    process.exit(1);
  }

  console.log(`Email sent! Resend ID: ${result?.id}`);
  console.log(`Subject: ${subject}`);
}

main().catch(console.error);
