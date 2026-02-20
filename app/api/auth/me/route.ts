import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    // Lazy subscription sync: if user has stripe_customer_id but is_paid is false,
    // check Stripe to ensure we haven't missed a webhook
    let cancelAtPeriodEnd = false;

    if (user.stripe_customer_id) {
      try {
        if (!user.is_paid) {
          // Check if they have an active subscription we missed
          const subscriptions = await stripe.subscriptions.list({
            customer: user.stripe_customer_id,
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
            user.stripe_subscription_id = subscriptions.data[0].id;
            cancelAtPeriodEnd = subscriptions.data[0].cancel_at_period_end;
          }
        } else if (user.stripe_subscription_id) {
          // Check if subscription is set to cancel at period end
          const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
          cancelAtPeriodEnd = subscription.cancel_at_period_end;
        }
      } catch {
        // Don't fail the whole request if Stripe check fails
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        is_paid: user.is_paid,
        selected_sources: user.selected_sources,
        created_at: user.created_at,
        subscription_cancel_at_period_end: cancelAtPeriodEnd,
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json({ user: null });
  }
}
