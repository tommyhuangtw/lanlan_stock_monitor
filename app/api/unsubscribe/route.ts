import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return new NextResponse(unsubscribeHtml('無效的連結', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    // Find user by magic link token
    const { data: magicLink } = await supabaseAdmin
      .from('magic_links')
      .select('user_id')
      .eq('token', token)
      .single();

    if (!magicLink) {
      return new NextResponse(unsubscribeHtml('連結已失效或無效', false), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Mark user as unsubscribed
    await supabaseAdmin
      .from('users')
      .update({ is_unsubscribed: true })
      .eq('id', magicLink.user_id);

    return new NextResponse(unsubscribeHtml('您已成功取消訂閱，將不再收到 Email。', true), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return new NextResponse(unsubscribeHtml('發生錯誤，請稍後再試', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function unsubscribeHtml(message: string, success: boolean): string {
  const color = success ? '#10b981' : '#ef4444';
  const icon = success ? '✓' : '✗';
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>取消訂閱 - 懶懶財經速報</title></head>
<body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px;max-width:400px;">
    <div style="width:64px;height:64px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;color:${color};">${icon}</div>
    <h1 style="color:#fff;font-size:20px;margin:0 0 12px;">${message}</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">如需重新訂閱，請登入控制台。</p>
    <a href="/" style="color:#f59e0b;text-decoration:none;font-size:14px;">返回首頁</a>
  </div>
</body>
</html>`;
}
