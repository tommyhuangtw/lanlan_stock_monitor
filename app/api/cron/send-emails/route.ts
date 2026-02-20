import { NextRequest, NextResponse } from 'next/server';
import { sendEmails } from '@/lib/pipeline/send-emails';
import { formatDateTaipei } from '@/lib/digest-cache';

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  const vercelCron = request.headers.get('x-vercel-cron');
  return vercelCron === '1';
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendEmails();
    return NextResponse.json({
      success: true,
      date: formatDateTaipei(new Date()),
      ...result,
    });
  } catch (error) {
    console.error('Send emails error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
