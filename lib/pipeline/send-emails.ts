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

// Resend Batch API supports up to 100 emails per call
const BATCH_SIZE = 100;

// Simple email format validator — filters out addresses that Resend will reject
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Generate HMAC-based unsubscribe URL (never expires)
function generateUnsubscribeUrl(userId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || 'fallback-secret';
  const signature = crypto.createHmac('sha256', secret).update(userId).digest('hex');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/unsubscribe?uid=${userId}&sig=${signature}`;
}

const BMC_URL = 'https://buymeacoffee.com/ailanrenbao';

// Days of week to show BMC block (Tuesday=2, Friday=5)
const BMC_SHOW_DAYS = [2, 5];

const BMC_VARIANTS = [
  {
    headline: '今天的摘要幫你省了多少研究時間？',
    cta: '請我喝杯咖啡',
    subtitle: '你的一杯咖啡 = 我們一天的 AI 運算費用',
  },
  {
    headline: '懶懶財經速報是一人獨立開發維運的專案',
    cta: '請我喝杯咖啡',
    subtitle: '每一份支持都讓這個專案走得更遠 🙏',
  },
  {
    headline: '覺得每天的摘要有幫助嗎？',
    cta: '請我喝杯咖啡',
    subtitle: '免費訂閱也完全沒問題，分享給朋友也是最大的支持！',
  },
  {
    headline: '一杯咖啡的價格，支持我們持續為你整理投資情報',
    cta: '買杯咖啡給我們',
    subtitle: '你的支持是我們持續營運的最大動力！',
  },
];

function shouldShowBmc(daysSinceSignup: number, today: Date): boolean {
  if (daysSinceSignup < 7) return false;
  const dayOfWeek = today.getDay();
  return BMC_SHOW_DAYS.includes(dayOfWeek);
}

function pickBmcVariant(dateStr: string): typeof BMC_VARIANTS[number] {
  const hash = dateStr.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return BMC_VARIANTS[hash % BMC_VARIANTS.length];
}

// Possible BMC insertion positions, rotated by date
// Each returns the index to insert BEFORE, or -1 if not found
type InsertionFinder = (html: string) => number;

const BMC_POSITIONS: { name: string; find: InsertionFinder }[] = [
  {
    // After 今日總覽 section — user just saw the highlights, peak value moment
    name: 'after-overview',
    find: (html) => {
      const overviewStart = html.indexOf('今日總覽');
      if (overviewStart === -1) return -1;
      // Find the section's closing </div></div> (the overview card wrapper)
      const sectionEnd = html.indexOf('</div>\n  </div>', overviewStart);
      return sectionEnd !== -1 ? sectionEnd + '</div>\n  </div>'.length : -1;
    },
  },
  {
    // After 風險提醒 / before 近期催化劑 — natural reading break in the middle
    name: 'mid-content',
    find: (html) => {
      // Before catalysts section
      const catalystIdx = html.indexOf('近期催化劑');
      if (catalystIdx !== -1) {
        // Find the <div style="padding:20px 16px;"> that wraps this section
        const sectionStart = html.lastIndexOf('<div style="padding:20px 16px;">', catalystIdx);
        return sectionStart !== -1 ? sectionStart : -1;
      }
      // Fallback: before 值得關注
      const monitorIdx = html.indexOf('值得關注');
      if (monitorIdx !== -1) {
        const sectionStart = html.lastIndexOf('<div style="padding:20px 16px;">', monitorIdx);
        return sectionStart !== -1 ? sectionStart : -1;
      }
      return -1;
    },
  },
  {
    // After all episode summaries — user finished reading, satisfaction peak
    name: 'after-episodes',
    find: (html) => {
      const unsubIdx = html.indexOf('<div style="padding:16px 20px;text-align:center;border-top:1px solid #eee;">');
      if (unsubIdx !== -1) return unsubIdx;
      const adSlotIdx = html.indexOf('<!-- AD_SLOT_BOTTOM -->');
      if (adSlotIdx !== -1) return adSlotIdx;
      return -1;
    },
  },
];

function pickBmcPosition(dateStr: string): number {
  const hash = dateStr.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return hash % BMC_POSITIONS.length;
}

function injectBuyMeACoffee(html: string, dateStr: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ailanbao.org';
  const variant = pickBmcVariant(dateStr);

  const bmcBlock = `<div style="padding:24px 16px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 12px;font-size:15px;color:#334155;font-weight:600;">${variant.headline}</p>
    <a href="${BMC_URL}" target="_blank" style="display:inline-block;padding:12px 28px;background:#FFDD00;color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      ☕ ${variant.cta}
    </a>
    <p style="margin:10px 0 0;font-size:12px;color:#64748b;">${variant.subtitle}</p>
  </div>`;

  // Pick position based on date (rotates across different days)
  const posIdx = pickBmcPosition(dateStr);
  const positions = BMC_POSITIONS;

  // Try preferred position first, then fallback through others
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[(posIdx + i) % positions.length];
    const insertIdx = pos.find(html);
    if (insertIdx !== -1) {
      return html.slice(0, insertIdx) + bmcBlock + html.slice(insertIdx);
    }
  }

  // Ultimate fallback
  const endMatch = html.lastIndexOf('</div>\n  </center>');
  if (endMatch !== -1) {
    return html.slice(0, endMatch) + bmcBlock + html.slice(endMatch);
  }
  return html;
}

export interface SendEmailsResult {
  usersProcessed: number;
  emailsSent: number;
  cacheHits: number;
  cacheMisses: number;
  skipped: number;
  alreadySent: number;
  errors: string[];
  warnings: string[];
}

// Prepared email data for a single user, ready for batch sending
interface PreparedEmail {
  userId: string;
  email: string;
  html: string;
  subject: string;
  unsubscribeUrl: string;
  digestId: number;
  episodeIds: number[];
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
    warnings: [],
  };

  const today = new Date();
  const dateStr = formatDateTaipei(today);

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
  const emailType = 'daily';

  // Get cached digest once (same for all users)
  const cacheResult = await getCachedDigest(
    supabaseAdmin,
    allSourceIds,
    emailType,
    today
  );

  if (!cacheResult.found) {
    if (cacheResult.reason === 'no_content') {
      results.skipped = users.length;
      results.usersProcessed = users.length;
      return results;
    }
    results.errors.push(`Cache miss (${cacheResult.reason}): ${generateCombinationKey(allSourceIds)}`);
    results.cacheMisses = users.length;
    results.usersProcessed = users.length;
    return results;
  }

  results.cacheHits = 1;
  const digest = cacheResult.digest!;
  const emailSubject = `今日懶懶財經速報 - ${dateStr}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  // Phase 1: Prepare all emails (generate per-user HTML)
  const preparedEmails: PreparedEmail[] = [];

  for (const user of users) {
    results.usersProcessed++;

    const userEmail = ((user.email as string) || '').trim();

    if (!userEmail || !isValidEmail(userEmail)) {
      results.warnings.push(`Skipped invalid email format: ${user.email}`);
      results.skipped++;
      continue;
    }

    try {
      // Check if already sent to this user
      const alreadySentToUser = await wasEmailSent(
        supabaseAdmin,
        digest.id,
        user.id as string
      );

      if (alreadySentToUser) {
        results.alreadySent++;
        continue;
      }

      // Generate HMAC-based unsubscribe URL (never expires)
      const unsubscribeUrl = generateUnsubscribeUrl(user.id as string);

      // Inject URLs into cached HTML
      let emailHtml = injectMagicLinkToHtml(digest.html_template, baseUrl, unsubscribeUrl);

      // Show "Buy Me a Coffee" block: only on specific weekdays, for users signed up 7+ days ago
      const createdAt = new Date(user.created_at as string);
      const daysSinceSignup = (today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (shouldShowBmc(daysSinceSignup, today)) {
        emailHtml = injectBuyMeACoffee(emailHtml, dateStr);
      }

      preparedEmails.push({
        userId: user.id as string,
        email: userEmail,
        html: emailHtml,
        subject: emailSubject,
        unsubscribeUrl,
        digestId: digest.id,
        episodeIds: digest.episode_ids,
      });
    } catch (err) {
      results.errors.push(`Error preparing email for ${user.email}: ${err}`);
    }
  }

  // Phase 2: Send in batches using Resend Batch API
  const { getPostHogServer } = await import('../posthog-server');

  for (let i = 0; i < preparedEmails.length; i += BATCH_SIZE) {
    const batch = preparedEmails.slice(i, i + BATCH_SIZE);

    const batchPayload = batch.map(entry => ({
      from: fromEmail,
      to: [entry.email],
      subject: entry.subject,
      html: entry.html,
      headers: {
        'List-Unsubscribe': `<${entry.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));

    try {
      const { data: batchResult, error: batchError } = await resend.batch.send(batchPayload);

      if (batchError) {
        const errorMsg = `Batch send failed: ${batchError.message}`;
        results.errors.push(errorMsg);
        for (const entry of batch) {
          results.errors.push(`Failed (batch error) for ${entry.email}`);
        }
        continue;
      }

      // Record each email from the batch result
      const batchData = batchResult?.data || [];
      const recordPromises = batch.map(async (entry, idx) => {
        const resendId = batchData[idx]?.id;

        // Record in digest_emails
        await recordEmailSent(
          supabaseAdmin,
          entry.digestId,
          entry.userId,
          '',
          resendId
        );

        // Record in email_logs for backward compatibility
        await supabaseAdmin.from('email_logs').insert({
          user_id: entry.userId,
          email_type: emailType,
          subject: entry.subject,
          episodes_included: entry.episodeIds,
          resend_id: resendId,
        });

        // Update user's last_email_sent
        await supabaseAdmin
          .from('users')
          .update({ last_email_sent: new Date().toISOString() })
          .eq('id', entry.userId);

        results.emailsSent++;

        // Track in PostHog
        getPostHogServer()?.capture({
          distinctId: entry.userId,
          event: 'email_sent',
          properties: {
            email_type: emailType,
            resend_id: resendId,
            source_count: allSourceIds.length,
          },
        });
      });

      await Promise.allSettled(recordPromises);
    } catch (err) {
      results.errors.push(`Batch send exception: ${err}`);
    }
  }

  // Flush PostHog events before returning (critical in serverless environments)
  await getPostHogServer()?.flush();

  return results;
}
