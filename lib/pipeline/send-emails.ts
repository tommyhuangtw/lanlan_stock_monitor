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

// Inline createMagicLink to avoid importing lib/auth.ts
// (which has top-level `import { cookies } from 'next/headers'`)
async function createMagicLink(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

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

export interface SendEmailsResult {
  usersProcessed: number;
  emailsSent: number;
  cacheHits: number;
  cacheMisses: number;
  skipped: number;
  alreadySent: number;
  errors: string[];
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
  const isMonday = today.getDay() === 1;
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

  for (const user of users) {
    results.usersProcessed++;

    // Calculate days since signup
    const daysSinceSignup = Math.floor(
      (today.getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine if should send
    // paid = daily, free trial (< 7 days) = daily, free after trial = Monday only
    let shouldSend = false;

    if (user.is_paid) {
      shouldSend = true;
    } else if (daysSinceSignup < 7) {
      shouldSend = true;
    } else if (isMonday) {
      shouldSend = true;
    }

    // Day 7: send trial-end reminder email for free users
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
          const trialMagicLink = await createMagicLink(user.id);
          const trialBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const trialToken = new URL(trialMagicLink).searchParams.get('token');
          const trialUnsubUrl = `${trialBaseUrl}/api/unsubscribe?token=${trialToken}`;

          const { data: trialResult, error: trialError } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
            to: user.email,
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
            results.emailsSent++;
          }
        }
      } catch (e) {
        results.errors.push(`Trial end email error for ${user.email}: ${e}`);
      }
    }

    if (!shouldSend) {
      results.skipped++;
      continue;
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
          results.skipped++;
          continue;
        }

        results.cacheMisses++;
        results.errors.push(
          `Cache miss for user ${user.id} (${cacheResult.reason}): ${generateCombinationKey(allSourceIds)}`
        );
        continue;
      }

      results.cacheHits++;
      const digest = cacheResult.digest!;

      // Check if already sent to this user
      const alreadySentToUser = await wasEmailSent(
        supabaseAdmin,
        digest.id,
        user.id
      );

      if (alreadySentToUser) {
        results.alreadySent++;
        continue;
      }

      // Generate user-specific magic link
      const magicLinkUrl = await createMagicLink(user.id);

      // Generate unsubscribe URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const magicLinkToken = new URL(magicLinkUrl).searchParams.get('token');
      const unsubscribeUrl = `${baseUrl}/api/unsubscribe?token=${magicLinkToken}`;

      // Inject magic link and unsubscribe URL into cached HTML
      let emailHtml = injectMagicLinkToHtml(digest.html_template, magicLinkUrl, unsubscribeUrl);

      // Inject trial CTA for free trial users
      if (!user.is_paid && daysSinceSignup < 7) {
        const upgradeUrl = `${baseUrl}/upgrade`;
        const trialCta = generateTrialCta(daysSinceSignup, upgradeUrl);
        emailHtml = emailHtml.replace('</body>', `${trialCta}</body>`);
      }

      // Send email
      const { data: emailResult, error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: user.email,
        subject: `今日懶懶財經速報 - ${dateStr}`,
        html: emailHtml,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (emailError) {
        results.errors.push(`Failed to send email to ${user.email}: ${emailError.message}`);
        continue;
      }

      // Record email sent
      await recordEmailSent(
        supabaseAdmin,
        digest.id,
        user.id,
        magicLinkUrl,
        emailResult?.id
      );

      // Update email_logs for backward compatibility
      await supabaseAdmin.from('email_logs').insert({
        user_id: user.id,
        email_type: emailType,
        subject: `今日懶懶財經速報 - ${dateStr}`,
        episodes_included: digest.episode_ids,
        resend_id: emailResult?.id,
      });

      // Update user's last_email_sent
      await supabaseAdmin
        .from('users')
        .update({ last_email_sent: new Date().toISOString() })
        .eq('id', user.id);

      results.emailsSent++;

    } catch (emailError) {
      results.errors.push(`Error sending email to ${user.email}: ${emailError}`);
    }
  }

  return results;
}

function generateTrialCta(daysSinceSignup: number, upgradeUrl: string): string {
  const daysLeft = 7 - daysSinceSignup;

  let msg: { text: string; subtext: string };

  if (daysLeft <= 1) {
    msg = {
      text: '最後一天！明天起改為每週一封',
      subtext: '立即升級繼續每天收到，前兩個月只要 NT$99/月',
    };
  } else if (daysLeft <= 3) {
    msg = {
      text: `免費體驗還剩 ${daysLeft} 天`,
      subtext: '7 天內升級享前兩個月 NT$99/月 優惠',
    };
  } else {
    msg = {
      text: `你正在免費體驗每日摘要，還剩 ${daysLeft} 天`,
      subtext: '7 天內升級享前兩個月 NT$99/月 優惠',
    };
  }

  return `
    <div style="max-width: 560px; margin: 16px auto 0; padding: 0 20px;">
      <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 20px; text-align: center;">
        <p style="color: #FBBF24; font-size: 15px; font-weight: 600; margin: 0 0 6px 0;">${msg.text}</p>
        <p style="color: #94A3B8; font-size: 13px; margin: 0 0 14px 0;">${msg.subtext}</p>
        <a href="${upgradeUrl}" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 600; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px;">
          升級專業版 →
        </a>
        ${daysLeft <= 1 ? '<p style="color: #64748B; font-size: 11px; margin: 10px 0 0 0;">錯過優惠後，升級價格為 NT$199/月</p>' : ''}
      </div>
    </div>
  `;
}

function generateTrialEndEmail(magicLinkUrl: string, upgradeUrl: string, unsubscribeUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0F172A; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #1E293B; border-radius: 16px; padding: 40px; border: 1px solid #334155;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #FBBF24, #D97706); border-radius: 12px; margin-bottom: 16px;"></div>
      <h1 style="color: #FFFFFF; font-size: 22px; margin: 0 0 8px 0;">你的每日摘要體驗已結束</h1>
      <p style="color: #94A3B8; font-size: 14px; margin: 0;">過去 7 天，你每天都收到了最新的投資摘要</p>
    </div>

    <!-- What changes -->
    <div style="background-color: #0F172A; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="color: #FFFFFF; font-size: 15px; font-weight: 600; margin: 0 0 12px 0;">從今天起有什麼不同？</p>
      <div style="display: flex; margin-bottom: 8px;">
        <span style="color: #EF4444; margin-right: 8px;">✕</span>
        <p style="color: #94A3B8; font-size: 14px; margin: 0;">不再每天收到摘要</p>
      </div>
      <div style="display: flex;">
        <span style="color: #10B981; margin-right: 8px;">✓</span>
        <p style="color: #94A3B8; font-size: 14px; margin: 0;">改為每週一收到一封週報</p>
      </div>
    </div>

    <!-- Promo CTA -->
    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #FBBF24; font-size: 13px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">限時優惠</p>
      <p style="color: #FFFFFF; font-size: 18px; font-weight: 700; margin: 0 0 4px 0;">前兩個月只要 NT$99/月</p>
      <p style="color: #94A3B8; font-size: 13px; margin: 0 0 16px 0;">升級專業版，繼續每天收到最新投資摘要</p>
      <a href="${upgradeUrl}" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
        立即升級 - NT$99/月 →
      </a>
      <p style="color: #64748B; font-size: 11px; margin: 12px 0 0 0;">錯過優惠後，升級價格為 NT$199/月</p>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;">
    <p style="color: #64748B; font-size: 12px; text-align: center; margin: 0;">
      懶懶財經速報 - AI 自動摘要投資 Podcast 及 YouTube<br>
      <a href="${magicLinkUrl}" style="color: #64748B; text-decoration: underline;">管理訂閱</a>
      &nbsp;·&nbsp;
      <a href="${unsubscribeUrl}" style="color: #64748B; text-decoration: underline;">取消訂閱</a>
    </p>
  </div>
</body>
</html>
`;
}
