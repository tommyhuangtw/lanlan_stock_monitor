import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: sources, error } = await supabaseAdmin
      .from('sources')
      .select('id, name, type, description, image_url')
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ sources: sources || [] });
  } catch (error) {
    console.error('Failed to fetch sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sources' },
      { status: 500 }
    );
  }
}
