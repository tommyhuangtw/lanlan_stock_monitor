import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { getPostHogServer } from '@/lib/posthog-server';

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
      console.warn('Payment failed for customer:', invoice.customer);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
