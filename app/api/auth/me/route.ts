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
    let subscriptionAmount: number | null = null; // in TWD (whole dollars)

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
            const sub = subscriptions.data[0];
            await supabaseAdmin
              .from('users')
              .update({
                is_paid: true,
                stripe_subscription_id: sub.id,
              })
              .eq('id', user.id);
            user.is_paid = true;
            user.stripe_subscription_id = sub.id;
            cancelAtPeriodEnd = sub.cancel_at_period_end;
            // Calculate actual monthly amount from subscription
            const subItem = sub.items.data[0];
            const subBase = subItem?.price?.unit_amount ? Math.round(subItem.price.unit_amount / 100) : null;
            if (subBase !== null) {
              const subDiscountObj = typeof sub.discounts?.[0] === 'object' ? sub.discounts[0] : null;
              const subCoupon = typeof subDiscountObj?.source?.coupon === 'object' ? subDiscountObj.source.coupon : null;
              if (subCoupon?.amount_off) {
                subscriptionAmount = Math.max(0, subBase - Math.round(subCoupon.amount_off / 100));
              } else if (subCoupon?.percent_off) {
                subscriptionAmount = Math.round(subBase * (1 - subCoupon.percent_off / 100));
              } else {
                subscriptionAmount = subBase;
              }
            }
          }
        } else if (user.stripe_subscription_id) {
          const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
          cancelAtPeriodEnd = subscription.cancel_at_period_end;
          // Calculate actual monthly amount from subscription
          const item = subscription.items.data[0];
          const baseAmount = item?.price?.unit_amount ? Math.round(item.price.unit_amount / 100) : null;
          if (baseAmount !== null) {
            // Check if there's an active discount (coupon) — Stripe v20: discount.source.coupon
            const discountObj = typeof subscription.discounts?.[0] === 'object' ? subscription.discounts[0] : null;
            const coupon = typeof discountObj?.source?.coupon === 'object' ? discountObj.source.coupon : null;
            if (coupon?.amount_off) {
              subscriptionAmount = Math.max(0, baseAmount - Math.round(coupon.amount_off / 100));
            } else if (coupon?.percent_off) {
              subscriptionAmount = Math.round(baseAmount * (1 - coupon.percent_off / 100));
            } else {
              subscriptionAmount = baseAmount;
            }
          }
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
        subscription_amount: subscriptionAmount,
        is_unsubscribed: user.is_unsubscribed || false,
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json({ user: null });
  }
}
