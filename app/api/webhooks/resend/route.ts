import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { supabaseAdmin } from '@/lib/supabase';
import { getPostHogServer } from '@/lib/posthog-server';
import { syncContactUnsubscribeStatus } from '@/lib/resend-audience';

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    to: string[];
    from: string;
    subject: string;
    created_at: string;
    click?: { link: string };
  };
}

const POSTHOG_EVENT_MAP: Record<string, string> = {
  'email.delivered': 'email_delivered',
  'email.opened': 'email_opened',
  'email.clicked': 'email_clicked',
  'email.bounced': 'email_bounced',
  'email.complained': 'email_complained',
};

export async function POST(request: NextRequest) {
  const body = await request.text();

  // Verify webhook signature
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let payload: ResendWebhookPayload;
  try {
    const wh = new Webhook(webhookSecret);
    payload = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload;
  } catch (err) {
    console.error('Resend webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const resendId = payload.data.email_id;
  const posthogEvent = POSTHOG_EVENT_MAP[payload.type];

  if (!posthogEvent) {
    // Unhandled event type, acknowledge receipt
    return NextResponse.json({ received: true });
  }

  // Look up user by resend_id
  const userId = await lookupUserByResendId(resendId);
  const distinctId = userId || payload.data.to?.[0] || 'unknown';

  // Send to PostHog
  getPostHogServer()?.capture({
    distinctId,
    event: posthogEvent,
    properties: {
      resend_id: resendId,
      email_to: payload.data.to?.[0],
      email_subject: payload.data.subject,
      ...(payload.data.click && { click_url: payload.data.click.link }),
      timestamp: payload.created_at,
    },
  });

  // Auto-unsubscribe on bounce or complaint to protect sender reputation
  if ((payload.type === 'email.bounced' || payload.type === 'email.complained') && userId) {
    await supabaseAdmin
      .from('users')
      .update({ is_unsubscribed: true })
      .eq('id', userId);

    // Sync unsubscribe status to Resend Audience
    syncContactUnsubscribeStatus(userId, true);

    getPostHogServer()?.capture({
      distinctId: userId,
      event: 'user_unsubscribed',
      properties: { method: `webhook_${payload.type.replace('email.', '')}` },
    });
  }

  await getPostHogServer()?.flush();
  return NextResponse.json({ received: true });
}

async function lookupUserByResendId(resendId: string): Promise<string | null> {
  // Check email_logs first (has both welcome and daily emails)
  const { data: emailLog } = await supabaseAdmin
    .from('email_logs')
    .select('user_id')
    .eq('resend_id', resendId)
    .limit(1)
    .single();

  if (emailLog?.user_id) return emailLog.user_id;

  // Fall back to digest_emails table
  const { data: digestEmail } = await supabaseAdmin
    .from('digest_emails')
    .select('user_id')
    .eq('resend_id', resendId)
    .limit(1)
    .single();

  return digestEmail?.user_id || null;
}
