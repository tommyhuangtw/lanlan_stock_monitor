import { NextRequest, NextResponse } from 'next/server';

/**
 * LINE Webhook endpoint.
 * Used to capture group ID when bot joins a group or receives messages.
 * Set this URL in LINE Developers Console → Messaging API → Webhook URL.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Log events so we can capture groupId
  for (const event of body.events || []) {
    const source = event.source || {};
    console.log('[LINE Webhook]', JSON.stringify({
      type: event.type,
      sourceType: source.type,
      groupId: source.groupId || null,
      userId: source.userId || null,
      timestamp: event.timestamp,
    }));

    // If someone sends a message containing "groupid" in the group,
    // reply with the group ID for easy capture
    if (
      source.type === 'group' &&
      event.type === 'message' &&
      event.message?.text?.toLowerCase().includes('groupid')
    ) {
      const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (token) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            replyToken: event.replyToken,
            messages: [{
              type: 'text',
              text: `✅ Group ID: ${source.groupId}`,
            }],
          }),
        });
      }
    }
  }

  // LINE requires 200 response
  return NextResponse.json({ status: 'ok' });
}

// LINE also sends GET for webhook URL verification
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
