import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    if (!user.stripe_customer_id) {
      return NextResponse.json({ error: '找不到有效訂閱' }, { status: 400 });
    }

    // Always query Stripe directly for the active subscription
    let subscriptionId = user.stripe_subscription_id;

    if (!subscriptionId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        subscriptionId = subscriptions.data[0].id;
        await supabaseAdmin
          .from('users')
          .update({
            is_paid: true,
            stripe_subscription_id: subscriptionId,
          })
          .eq('id', user.id);
      }
    }

    if (!subscriptionId) {
      return NextResponse.json({ error: '找不到有效訂閱' }, { status: 400 });
    }

    // Resume subscription by removing scheduled cancellation
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resume subscription error:', error);
    return NextResponse.json(
      { error: '恢復訂閱失敗，請稍後再試' },
      { status: 500 }
    );
  }
}
