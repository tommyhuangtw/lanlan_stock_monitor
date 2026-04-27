import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password } = body;

  // Simple password auth for personal use
  const correctPassword = process.env.WATCHLIST_PASSWORD || 'lanlan2026';

  if (password === correctPassword) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}
