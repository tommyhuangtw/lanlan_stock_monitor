import { NextResponse } from 'next/server';
import { verifyMagicLink, setSessionCookie } from '@/lib/auth';
import { getPostHogServer } from '@/lib/posthog-server';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: '無效的連結' }, { status: 400 });
    }

    const result = await verifyMagicLink(token);

    if (!result) {
      return NextResponse.json({ error: '連結已過期或無效' }, { status: 400 });
    }

    // Set session cookie
    await setSessionCookie(result.sessionToken);

    getPostHogServer()?.capture({
      distinctId: result.user.id,
      event: 'email_verified',
      properties: { email: result.user.email },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        is_paid: result.user.is_paid,
      }
    });
  } catch (error) {
    console.error('Verify magic link error:', error);
    return NextResponse.json(
      { error: '驗證失敗，請稍後再試' },
      { status: 500 }
    );
  }
}
