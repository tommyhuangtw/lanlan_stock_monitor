import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { getPostHogServer } from '@/lib/posthog-server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const customerId = session.customer as string;

      if (userId) {
        await supabaseAdmin
          .from('users')
          .update({
            is_paid: true,
            stripe_customer_id: customerId,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId);

        getPostHogServer()?.capture({
          distinctId: userId,
          event: 'subscription_created',
          properties: { stripe_customer_id: customerId },
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;

      // Look up user before updating to get their ID for tracking
      const { data: cancelledUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      await supabaseAdmin
        .from('users')
        .update({
          is_paid: false,
          stripe_subscription_id: null,
        })
        .eq('stripe_customer_id', customerId);

      if (cancelledUser) {
        getPostHogServer()?.capture({
          distinctId: cancelledUser.id,
          event: 'subscription_cancelled',
          properties: { stripe_customer_id: customerId },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customerId = invoice.customer as string;
      console.warn('Payment failed for customer:', customerId);

      try {
        const { data: failedUser } = await supabaseAdmin
          .from('users')
          .select('id, email')
          .eq('stripe_customer_id', customerId)
          .single();

        if (failedUser) {
          // Create Stripe billing portal session for updating payment method
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`,
          });

          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
            to: failedUser.email,
            subject: '懶懶財經速報 - 付款失敗通知',
            html: generatePaymentFailedEmail(portalSession.url),
          });

          getPostHogServer()?.capture({
            distinctId: failedUser.id,
            event: 'payment_failed',
            properties: { stripe_customer_id: customerId },
          });
        }
      } catch (err) {
        console.error('Failed to handle payment_failed:', err);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

function generatePaymentFailedEmail(portalUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0F172A; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #1E293B; border-radius: 16px; padding: 40px; border: 1px solid #475569;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #FFFFFF; font-size: 22px; margin: 0 0 8px 0;">付款失敗通知</h1>
      <p style="color: #CBD5E1; font-size: 14px; margin: 0;">您的訂閱付款未成功，請更新付款方式以繼續使用服務。</p>
    </div>

    <div style="background-color: #0F172A; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="color: #FFFFFF; font-size: 15px; font-weight: 600; margin: 0 0 12px 0;">可能的原因：</p>
      <p style="color: #CBD5E1; font-size: 14px; margin: 0 0 8px 0;">- 信用卡已過期或餘額不足</p>
      <p style="color: #CBD5E1; font-size: 14px; margin: 0;">- 銀行拒絕了此筆交易</p>
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${portalUrl}" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
        更新付款方式
      </a>
    </div>

    <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">
      如付款持續失敗，您的訂閱將在帳期結束後自動取消。<br>
      如有疑問，請回覆此封 Email。
    </p>

    <hr style="border: none; border-top: 1px solid #475569; margin: 24px 0;">
    <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">
      懶懶財經速報 - AI 自動摘要投資 Podcast 及 YouTube
    </p>
  </div>
</body>
</html>
`;
}
