import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const { selectedSources } = await request.json();

    if (!Array.isArray(selectedSources)) {
      return NextResponse.json({ error: '無效的資料格式' }, { status: 400 });
    }

    // Verify all source IDs are valid
    const { data: validSources } = await supabaseAdmin
      .from('sources')
      .select('id')
      .eq('is_active', true);

    const validSourceIds = new Set(validSources?.map(s => s.id) || []);
    const invalidSources = selectedSources.filter(id => !validSourceIds.has(id));

    if (invalidSources.length > 0) {
      return NextResponse.json(
        { error: '包含無效的來源' },
        { status: 400 }
      );
    }

    // Update user's selected sources
    const { error } = await supabaseAdmin
      .from('users')
      .update({ selected_sources: selectedSources })
      .eq('id', user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update sources error:', error);
    return NextResponse.json(
      { error: '更新失敗，請稍後再試' },
      { status: 500 }
    );
  }
}
