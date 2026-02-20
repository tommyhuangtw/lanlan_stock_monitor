import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import Stripe from 'stripe';

export async function POST() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    if (user.is_paid) {
      return NextResponse.json({ error: '您已是專業版用戶' }, { status: 400 });
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;

      await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?upgraded=true`,
      cancel_url: `${baseUrl}/upgrade?cancelled=true`,
      metadata: { user_id: user.id },
    };

    // Apply promotional coupon only during first 3 days (trial period)
    const daysSinceSignup = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (process.env.STRIPE_PROMO_COUPON_ID && daysSinceSignup < 3) {
      sessionParams.discounts = [{ coupon: process.env.STRIPE_PROMO_COUPON_ID }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Create checkout session error:', error);
    return NextResponse.json(
      { error: '建立付款失敗，請稍後再試' },
      { status: 500 }
    );
  }
}
