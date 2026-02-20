import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createMagicLink } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  // Rate limit: 5 requests per 15 minutes per IP
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`magic-link:${ip}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: '請求過於頻繁，請稍後再試' },
      { status: 429 }
    );
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: '請輸入 Email' }, { status: 400 });
    }

    // Find user by email
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) {
      // Don't reveal if email exists or not for security
      return NextResponse.json({
        success: true,
        message: '如果此 Email 已註冊，你將收到登入連結'
      });
    }

    // Create magic link
    const magicLinkUrl = await createMagicLink(user.id);

    // Send email
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: user.email,
        subject: '登入懶懶財經速報',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0F172A; padding: 40px 20px;">
            <div style="max-width: 480px; margin: 0 auto; background-color: #1E293B; border-radius: 16px; padding: 40px; border: 1px solid #334155;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #FBBF24, #D97706); border-radius: 12px; margin-bottom: 16px;"></div>
                <h1 style="color: #FFFFFF; font-size: 24px; margin: 0;">登入懶懶財經速報</h1>
              </div>

              <p style="color: #94A3B8; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                點擊下方按鈕登入你的帳戶：
              </p>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${magicLinkUrl}" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
                  登入帳戶
                </a>
              </div>

              <p style="color: #64748B; font-size: 14px; line-height: 1.5;">
                此連結將在 15 分鐘後失效。如果你沒有要求登入，請忽略此郵件。
              </p>

              <hr style="border: none; border-top: 1px solid #334155; margin: 32px 0;">

              <p style="color: #64748B; font-size: 12px; text-align: center;">
                懶懶財經速報 - AI 自動摘要投資 Podcast
              </p>
            </div>
          </body>
          </html>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send magic link email:', emailError);
      // Log for debugging but still return success
    }

    return NextResponse.json({
      success: true,
      message: '如果此 Email 已註冊，你將收到登入連結'
    });
  } catch (error) {
    console.error('Send magic link error:', error);
    return NextResponse.json(
      { error: '發生錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}
