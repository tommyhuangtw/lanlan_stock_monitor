import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const newValue = !user.is_unsubscribed;

    const { error } = await supabaseAdmin
      .from('users')
      .update({ is_unsubscribed: newValue })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: '操作失敗，請稍後再試' }, { status: 500 });
    }

    return NextResponse.json({ is_unsubscribed: newValue });
  } catch (error) {
    console.error('Toggle subscription emails error:', error);
    return NextResponse.json(
      { error: '操作失敗，請稍後再試' },
      { status: 500 }
    );
  }
}
