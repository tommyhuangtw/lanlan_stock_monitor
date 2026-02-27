import { supabaseAdmin } from '../supabase';
import { injectMagicLinkToHtml } from '../email-generator';
import {
  generateCombinationKey,
  getCachedDigest,
  recordEmailSent,
  wasEmailSent,
  formatDateTaipei,
} from '../digest-cache';

import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 10;

// Inline createMagicLink to avoid importing lib/auth.ts
// (which has top-level `import { cookies } from 'next/headers'`)
async function createMagicLink(userId: string, expiresInMs = 15 * 60 * 1000): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInMs);

  await supabaseAdmin
    .from('magic_links')
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
    });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/auth/verify?token=${token}`;
}

// Generate HMAC-based unsubscribe URL (never expires)
function generateUnsubscribeUrl(userId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || 'fallback-secret';
  const signature = crypto.createHmac('sha256', secret).update(userId).digest('hex');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/unsubscribe?uid=${userId}&sig=${signature}`;
}

// Calculate days between two dates using Taipei timezone
function daysSinceSignupTaipei(createdAt: string): number {
  const todayStr = formatDateTaipei(new Date());
  const createdStr = formatDateTaipei(new Date(createdAt));
  return Math.floor(
    (new Date(todayStr).getTime() - new Date(createdStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

export interface SendEmailsResult {
  usersProcessed: number;
  emailsSent: number;
  cacheHits: number;
  cacheMisses: number;
  skipped: number;
  alreadySent: number;
  errors: string[];
}

interface ProcessUserResult {
  sent: boolean;
  cacheHit: boolean;
  cacheMiss: boolean;
  skipped: boolean;
  alreadySent: boolean;
  error?: string;
}

export async function sendEmails(): Promise<SendEmailsResult> {
  const results: SendEmailsResult = {
    usersProcessed: 0,
    emailsSent: 0,
    cacheHits: 0,
    cacheMisses: 0,
    skipped: 0,
    alreadySent: 0,
    errors: [],
  };

  const today = new Date();
  const dateStr = formatDateTaipei(today);
  // Use Taipei timezone for day-of-week check
  const todayTaipei = formatDateTaipei(today);
  const isWednesday = new Date(todayTaipei).getDay() === 3;
  const emailType = 'daily' as const;

  // Get all active users (exclude unsubscribed)
  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('*')
    .neq('is_unsubscribed', true);

  if (usersError) {
    throw new Error(`Failed to fetch users: ${usersError.message}`);
  }

  if (!users || users.length === 0) {
    return results;
  }

  // Get all active sources
  const { data: activeSources, error: sourcesError } = await supabaseAdmin
    .from('sources')
    .select('id')
    .eq('is_active', true);

  if (sourcesError || !activeSources || activeSources.length === 0) {
    results.errors.push(`No active sources: ${sourcesError?.message || 'none found'}`);
    return results;
  }

  const allSourceIds = activeSources.map(s => s.id);

  // Process users in batches for parallel sending
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(user => processUser(user, allSourceIds, today, dateStr, isWednesday, emailType))
    );

    for (const result of batchResults) {
      results.usersProcessed++;
      if (result.status === 'fulfilled') {
        const r = result.value;
        if (r.sent) results.emailsSent++;
        if (r.cacheHit) results.cacheHits++;
        if (r.cacheMiss) results.cacheMisses++;
        if (r.skipped) results.skipped++;
        if (r.alreadySent) results.alreadySent++;
        if (r.error) results.errors.push(r.error);
      } else {
        results.errors.push(`Unexpected error: ${result.reason}`);
      }
    }
  }

  return results;
}

async function processUser(
  user: Record<string, unknown>,
  allSourceIds: string[],
  today: Date,
  dateStr: string,
  isWednesday: boolean,
  emailType: 'daily' | 'weekly'
): Promise<ProcessUserResult> {
  const result: ProcessUserResult = {
    sent: false,
    cacheHit: false,
    cacheMiss: false,
    skipped: false,
    alreadySent: false,
  };

  // Lazy sync: if user has stripe_customer_id but is_paid is false,
  // check Stripe for active subscription (mirrors /api/auth/me logic)
  if (user.stripe_customer_id && !user.is_paid && process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
      const subscriptions = await stripeClient.subscriptions.list({
        customer: user.stripe_customer_id as string,
        status: 'active',
        limit: 1,
      });
      if (subscriptions.data.length > 0) {
        await supabaseAdmin
          .from('users')
          .update({
            is_paid: true,
            stripe_subscription_id: subscriptions.data[0].id,
          })
          .eq('id', user.id);
        user.is_paid = true;
        console.log(`[sendEmails] Lazy-synced is_paid=true for ${user.email}`);
      }
    } catch (err) {
      console.warn(`[sendEmails] Stripe sync failed for ${user.email}:`, err);
    }
  }

  // Calculate days since signup using Taipei timezone
  const daysSinceSignup = daysSinceSignupTaipei(user.created_at as string);

  // Day 7: send trial-end reminder email for free users, skip regular digest
  if (!user.is_paid && daysSinceSignup === 7) {
    try {
      // Check if already sent trial_end email
      const { data: alreadySentTrialEnd } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('email_type', 'trial_end')
        .limit(1)
        .single();

      if (!alreadySentTrialEnd) {
        const trialMagicLink = await createMagicLink(user.id as string, THREE_DAYS_MS);
        const trialBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const trialUnsubUrl = generateUnsubscribeUrl(user.id as string);

        const { data: trialResult, error: trialError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
          to: user.email as string,
          subject: '你的每日摘要體驗已結束',
          html: generateTrialEndEmail(trialMagicLink, `${trialBaseUrl}/upgrade`, trialUnsubUrl),
          headers: {
            'List-Unsubscribe': `<${trialUnsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });

        if (!trialError) {
          await supabaseAdmin.from('email_logs').insert({
            user_id: user.id,
            email_type: 'trial_end',
            subject: '你的每日摘要體驗已結束',
            resend_id: trialResult?.id,
          });
          result.sent = true;
        }
      }
    } catch (e) {
      result.error = `Trial end email error for ${user.email}: ${e}`;
    }
    // Skip regular digest on day 7 (avoid overlap with Wednesday email)
    result.skipped = true;
    return result;
  }

  // Determine if should send
  // paid = daily, free trial (< 7 days) = daily, free after trial = Wednesday only
  let shouldSend = false;

  if (user.is_paid) {
    shouldSend = true;
  } else if (daysSinceSignup < 7) {
    shouldSend = true;
  } else if (isWednesday) {
    shouldSend = true;
  }

  if (!shouldSend) {
    result.skipped = true;
    return result;
  }

  try {
    // Get cached digest
    const cacheResult = await getCachedDigest(
      supabaseAdmin,
      allSourceIds,
      emailType,
      today
    );

    if (!cacheResult.found) {
      if (cacheResult.reason === 'no_content') {
        result.skipped = true;
        return result;
      }

      result.cacheMiss = true;
      result.error = `Cache miss for user ${user.id} (${cacheResult.reason}): ${generateCombinationKey(allSourceIds)}`;
      return result;
    }

    result.cacheHit = true;
    const digest = cacheResult.digest!;

    // Check if already sent to this user
    const alreadySentToUser = await wasEmailSent(
      supabaseAdmin,
      digest.id,
      user.id as string
    );

    if (alreadySentToUser) {
      result.alreadySent = true;
      return result;
    }

    // Generate user-specific magic link (7-day expiry for email links)
    const magicLinkUrl = await createMagicLink(user.id as string, THREE_DAYS_MS);

    // Generate HMAC-based unsubscribe URL (never expires)
    const unsubscribeUrl = generateUnsubscribeUrl(user.id as string);

    // Inject magic link and unsubscribe URL into cached HTML
    let emailHtml = injectMagicLinkToHtml(digest.html_template, magicLinkUrl, unsubscribeUrl);

    // Inject trial CTA for free trial users (at the top of email)
    let emailSubject = `今日懶懶財經速報 - ${dateStr}`;
    if (!user.is_paid && daysSinceSignup < 7) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const upgradeUrl = `${baseUrl}/upgrade`;
      const trialCta = generateTrialCta(daysSinceSignup, upgradeUrl);
      emailHtml = emailHtml.replace('<!-- CTA_INJECTION_POINT -->', trialCta);

      // Add trial countdown to subject with urgency escalation
      const daysLeft = 7 - daysSinceSignup;
      if (daysLeft <= 1) {
        emailSubject = `⚠ 今日懶懶財經速報 - ${dateStr}（限時優惠最後一天！）`;
      } else if (daysLeft <= 3) {
        emailSubject = `⏰ 今日懶懶財經速報 - ${dateStr}（限時優惠倒數 ${daysLeft} 天）`;
      } else {
        emailSubject = `今日懶懶財經速報 - ${dateStr}（還剩 ${daysLeft} 天）`;
      }
    }

    // Send email
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: user.email as string,
      subject: emailSubject,
      html: emailHtml,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (emailError) {
      result.error = `Failed to send email to ${user.email}: ${emailError.message}`;
      return result;
    }

    // Record email sent
    await recordEmailSent(
      supabaseAdmin,
      digest.id,
      user.id as string,
      magicLinkUrl,
      emailResult?.id
    );

    // Update email_logs for backward compatibility
    await supabaseAdmin.from('email_logs').insert({
      user_id: user.id,
      email_type: emailType,
      subject: emailSubject,
      episodes_included: digest.episode_ids,
      resend_id: emailResult?.id,
    });

    // Update user's last_email_sent
    await supabaseAdmin
      .from('users')
      .update({ last_email_sent: new Date().toISOString() })
      .eq('id', user.id);

    result.sent = true;

  } catch (emailError) {
    result.error = `Error sending email to ${user.email}: ${emailError}`;
  }

  return result;
}

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
    // Red — last day (matches frontend red-500 urgency)
    headline = '⚠ 最後一天！優惠價即將結束';
    footnote = '<p style="color: #6B7280; font-size: 11px; margin: 10px 0 0 0;">明天起升級價格恢復為 ' + NT + '$199/月</p>';
    bgGradient = 'rgba(239, 68, 68, 0.12), rgba(220, 38, 38, 0.06)';
    borderColor = 'rgba(239, 68, 68, 0.4)';
    headlineColor = '#EF4444';
    btnBg = '#EF4444';
    btnTextColor = '#FFFFFF';
  } else if (daysLeft <= 3) {
    // Orange + urgency copy
    headline = '⏰ 優惠即將結束，還剩 ' + daysLeft + ' 天';
    bgGradient = 'rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.06)';
    borderColor = 'rgba(245, 158, 11, 0.3)';
    headlineColor = '#D97706';
    btnBg = '#F59E0B';
    btnTextColor = '#0F172A';
  } else {
    // Orange — normal
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

function generateTrialEndEmail(magicLinkUrl: string, upgradeUrl: string, unsubscribeUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0F172A; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #1E293B; border-radius: 16px; padding: 40px; border: 1px solid #475569;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #FBBF24, #D97706); border-radius: 12px; margin-bottom: 16px;"></div>
      <h1 style="color: #FFFFFF; font-size: 22px; margin: 0 0 8px 0;">你的每日摘要體驗已結束</h1>
      <p style="color: #CBD5E1; font-size: 14px; margin: 0;">過去 7 天，你每天都收到了最新的投資摘要</p>
    </div>

    <!-- What changes -->
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

    <!-- Promo CTA -->
    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #FBBF24; font-size: 13px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">限時優惠</p>
      <p style="color: #FFFFFF; font-size: 18px; font-weight: 700; margin: 0 0 4px 0;"><span style="text-decoration: line-through; color: #94A3B8; font-size: 14px; font-weight: 400; margin-right: 8px;">NT$199/月</span>前兩個月只要 NT$99/月</p>
      <p style="color: #CBD5E1; font-size: 13px; margin: 0 0 16px 0;">升級專業版，繼續每天收到最新投資摘要</p>
      <a href="${upgradeUrl}" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
        立即升級 - NT$99/月 →
      </a>
      <p style="color: #94A3B8; font-size: 11px; margin: 12px 0 0 0;">錯過優惠後，升級價格為 NT$199/月</p>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #475569; margin: 24px 0;">
    <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">
      懶懶財經速報 - AI 自動摘要投資 Podcast 及 YouTube<br>
      <a href="${magicLinkUrl}" style="color: #94A3B8; text-decoration: underline;">管理訂閱</a>
      &nbsp;·&nbsp;
      <a href="${unsubscribeUrl}" style="color: #94A3B8; text-decoration: underline;">取消訂閱</a>
    </p>
  </div>
</body>
</html>
`;
}
