import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createMagicLink } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getLatestCompletedDigest, generateCombinationKey } from '@/lib/digest-cache';
import { injectMagicLinkToHtml } from '@/lib/email-generator';
import { getPostHogServer } from '@/lib/posthog-server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Default sources for example email
const EXAMPLE_SOURCES = ['gooaye', 'finance-horn']; // 股癌, 財經號角

interface ExampleAnalysis {
  sourceName: string;
  episodeTitle: string;
  summary: string;
  keyPoints: string[];
  stocksMentioned: Array<{ ticker: string; sentiment: string }>;
}

export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per 15 minutes per IP
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`signup:${ip}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: '請求過於頻繁，請稍後再試' },
      { status: 429 }
    );
  }

  try {
    const { email } = await request.json();

    // Validate input
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: '請輸入有效的 Email' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: '此 Email 已註冊' },
        { status: 400 }
      );
    }

    // Create user
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        email: email.toLowerCase().trim(),
        is_paid: false,
      })
      .select()
      .single();

    if (userError) {
      throw new Error(userError.message);
    }

    // Get all active sources
    const { data: sources } = await supabaseAdmin
      .from('sources')
      .select('id, name')
      .eq('is_active', true);

    const sourceNames = sources?.map(s => s.name).join('、') || '全部熱門投資 Podcast 及 YouTube 頻道';
    const allSourceIds = sources?.map(s => s.id) || [];

    // Create magic link for the welcome email
    const magicLinkUrl = await createMagicLink(user.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const magicLinkToken = new URL(magicLinkUrl).searchParams.get('token');
    const unsubscribeUrl = `${baseUrl}/api/unsubscribe?token=${magicLinkToken}`;

    // Try to get the latest real digest to include in welcome email
    let emailSubject = '歡迎加入 懶懶財經速報！這是你的第一封摘要範例';
    let emailHtml = '';

    try {
      const latestDigest = allSourceIds.length > 0
        ? await getLatestCompletedDigest(supabaseAdmin, allSourceIds)
        : null;

      if (latestDigest?.html_template) {
        // Use real digest with welcome header
        const digestHtml = injectMagicLinkToHtml(latestDigest.html_template, magicLinkUrl, unsubscribeUrl);
        emailHtml = injectWelcomeHeader(digestHtml, sourceNames, magicLinkUrl);
        emailSubject = '歡迎加入 懶懶財經速報！這是最新一期投資摘要';
      } else {
        // Fallback to example content
        const exampleAnalyses = await fetchExampleAnalyses();
        emailHtml = generateWelcomeEmailWithExample(sourceNames, magicLinkUrl, exampleAnalyses);
      }
    } catch (digestError) {
      console.error('Error fetching digest for welcome email:', digestError);
      // Fallback to example content
      const exampleAnalyses = await fetchExampleAnalyses();
      emailHtml = generateWelcomeEmailWithExample(sourceNames, magicLinkUrl, exampleAnalyses);
    }

    // Send welcome email
    try {
      const { error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: email,
        subject: emailSubject,
        html: emailHtml,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (emailError) {
        console.error('Failed to send welcome email:', emailError);
      } else {
        await supabaseAdmin.from('email_logs').insert({
          user_id: user.id,
          email_type: 'welcome',
          subject: emailSubject,
        });
      }
    } catch (emailError) {
      console.error('Email send error:', emailError);
      // Don't fail the signup if email fails
    }

    getPostHogServer()?.capture({
      distinctId: user.id,
      event: 'user_signed_up',
      properties: { email: email.toLowerCase().trim() },
    });

    return NextResponse.json({
      success: true,
      userId: user.id,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: '註冊失敗，請稍後再試' },
      { status: 500 }
    );
  }
}

async function fetchExampleAnalyses(): Promise<ExampleAnalysis[]> {
  try {
    // Try to get real analyses from the database
    const { data: analyses } = await supabaseAdmin
      .from('analyses')
      .select(`
        summary,
        key_points,
        stocks_mentioned,
        episodes!inner (
          title,
          source_id,
          sources (
            id,
            name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (analyses && analyses.length > 0) {
      // Filter to example sources if possible
      const filtered = analyses.filter(a => {
        const episode = a.episodes as unknown as { source_id: string };
        return EXAMPLE_SOURCES.includes(episode?.source_id);
      });

      const toUse = filtered.length > 0 ? filtered.slice(0, 2) : analyses.slice(0, 2);

      return toUse.map(a => {
        const episode = a.episodes as unknown as { title: string; sources: { name: string } };
        return {
          sourceName: (episode?.sources as unknown as { name: string })?.name || '投資 Podcast',
          episodeTitle: episode?.title || '最新一集',
          summary: a.summary || '',
          keyPoints: (a.key_points as string[]) || [],
          stocksMentioned: (a.stocks_mentioned as Array<{ ticker: string; sentiment: string }>) || [],
        };
      });
    }
  } catch (error) {
    console.error('Error fetching example analyses:', error);
  }

  // Return sample data if no real data available
  return getSampleAnalyses();
}

function getSampleAnalyses(): ExampleAnalysis[] {
  return [
    {
      sourceName: '股癌',
      episodeTitle: 'EP450｜AI 概念股還能追嗎？台積電法說會重點整理',
      summary: '本集討論 AI 概念股的投資策略，分析台積電最新法說會的重點。主持人認為目前 AI 相關個股估值偏高，建議投資人保持謹慎，等待更好的進場點位。同時也提到美國科技股財報季即將到來，可能會影響市場走勢。',
      keyPoints: [
        '台積電法說會釋出正面訊號，但股價已反映大部分利多',
        'AI 伺服器需求持續強勁，但要注意庫存週期',
        '建議分批進場，不要追高',
      ],
      stocksMentioned: [
        { ticker: 'TSM', sentiment: 'bullish' },
        { ticker: 'NVDA', sentiment: 'neutral' },
        { ticker: '2330.TW', sentiment: 'bullish' },
      ],
    },
    {
      sourceName: '財經號角',
      episodeTitle: '聯準會利率決策分析｜美股後市展望',
      summary: '深入分析聯準會最新利率決策對市場的影響。討論美國經濟數據、通膨走勢，以及對台股外資動向的可能影響。建議投資人關注即將公布的非農就業數據。',
      keyPoints: [
        '聯準會維持利率不變，符合市場預期',
        '年底前可能還有一次降息機會',
        '美元走弱有利於新興市場',
      ],
      stocksMentioned: [
        { ticker: 'SPY', sentiment: 'bullish' },
        { ticker: 'QQQ', sentiment: 'neutral' },
      ],
    },
  ];
}

function injectWelcomeHeader(
  digestHtml: string,
  sourceNames: string,
  magicLinkUrl: string
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const welcomeBlock = `
    <div style="max-width:600px; width:100%; margin:0 auto 16px; background-color:#334155; border-radius:12px; padding:32px; box-shadow:0 4px 20px rgba(0,0,0,0.08); text-align:left;">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 28px;">
        <img src="${baseUrl}/icon.png" width="48" height="48" alt="懶懶財經速報" style="border-radius: 10px; display: inline-block; margin-bottom: 14px;" />
        <h1 style="color: #FFFFFF; font-size: 24px; font-weight: 700; margin: 0 0 8px 0;">歡迎加入懶懶財經速報！</h1>
        <p style="color: #CBD5E1; font-size: 14px; margin: 0;">你的 AI 投資 Podcast 及 YouTube 摘要助手</p>
      </div>

      <!-- Timeline -->
      <div style="margin-bottom: 24px;">
        <p style="color: #FFFFFF; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">接下來會發生什麼？</p>
        <div style="border-left: 2px solid #64748B; padding-left: 20px; margin-left: 8px;">
          <div style="margin-bottom: 16px;">
            <p style="color: #10B981; font-size: 14px; font-weight: 600; margin: 0;">現在</p>
            <p style="color: #E2E8F0; font-size: 14px; margin: 4px 0 0 0;">你已成功註冊！以下是最新一期的投資摘要</p>
          </div>
          <div style="margin-bottom: 16px;">
            <p style="color: #F59E0B; font-size: 14px; font-weight: 600; margin: 0;">前 7 天</p>
            <p style="color: #E2E8F0; font-size: 14px; margin: 4px 0 0 0;">每天收到最新摘要（免費體驗）</p>
          </div>
          <div>
            <p style="color: #CBD5E1; font-size: 14px; font-weight: 600; margin: 0;">第 8 天起</p>
            <p style="color: #CBD5E1; font-size: 14px; margin: 4px 0 0 0;">免費版改為每週一封・<a href="${baseUrl}/upgrade" style="color: #F59E0B; text-decoration: none;">升級專業版</a>可繼續每天收到</p>
          </div>
        </div>
      </div>

      <!-- Upgrade CTA -->
      <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 24px; text-align: center;">
        <p style="color: #FBBF24; font-size: 13px; font-weight: 600; margin: 0 0 10px 0;">&#127873; 新用戶限時優惠</p>
        <p style="color: #FFFFFF; font-size: 22px; font-weight: 700; margin: 0 0 4px 0;"><span style="text-decoration: line-through; color: #94A3B8; font-size: 14px; font-weight: 400; margin-right: 8px;">NT$199/月</span>NT$99/月</p>
        <p style="color: #CBD5E1; font-size: 13px; margin: 0 0 18px 0;">前兩個月享半價，升級後每天收到最新摘要</p>
        <a href="${baseUrl}/upgrade" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 700; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px;">立即升級 →</a>
        <p style="color: #94A3B8; font-size: 11px; margin: 10px 0 0 0;">7 天內升級才享有此優惠</p>
      </div>
    </div>
  `;

  // Insert welcome block BEFORE the main-card div (as a separate card)
  const mainCardMatch = digestHtml.match(/<div class="main-card"/);
  if (mainCardMatch && mainCardMatch.index !== undefined) {
    return digestHtml.slice(0, mainCardMatch.index) + welcomeBlock + digestHtml.slice(mainCardMatch.index);
  }

  // Fallback: insert before the first major content div after <center>
  const centerMatch = digestHtml.match(/<center>\s*/);
  if (centerMatch && centerMatch.index !== undefined) {
    const insertPos = centerMatch.index + centerMatch[0].length;
    return digestHtml.slice(0, insertPos) + welcomeBlock + digestHtml.slice(insertPos);
  }

  // Last resort: prepend before body content
  const bodyMatch = digestHtml.match(/<body[^>]*>/);
  if (bodyMatch && bodyMatch.index !== undefined) {
    const insertPos = bodyMatch.index + bodyMatch[0].length;
    return digestHtml.slice(0, insertPos) + '<center>' + welcomeBlock + '</center>' + digestHtml.slice(insertPos);
  }

  return welcomeBlock + digestHtml;
}

function generateWelcomeEmailWithExample(
  sourceNames: string,
  magicLinkUrl: string,
  exampleAnalyses: ExampleAnalysis[]
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Generate example content HTML
  let exampleContentHtml = '';
  for (const analysis of exampleAnalyses) {
    const stocksHtml = analysis.stocksMentioned.length > 0
      ? analysis.stocksMentioned.map(stock => {
          const bgColor = stock.sentiment === 'bullish' ? '#10B981' : stock.sentiment === 'bearish' ? '#EF4444' : '#9CA3AF';
          return `<span style="display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; color: #FFFFFF; background-color: ${bgColor}; margin: 2px 4px 2px 0;">${stock.ticker}</span>`;
        }).join('')
      : '';

    const keyPointsHtml = analysis.keyPoints.length > 0
      ? `<ul style="margin: 12px 0 0 0; padding-left: 20px; color: #CBD5E1; font-size: 14px;">
          ${analysis.keyPoints.map(point => `<li style="margin-bottom: 4px;">${point}</li>`).join('')}
         </ul>`
      : '';

    exampleContentHtml += `
      <div style="background-color: #0F172A; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <p style="color: #F59E0B; font-size: 12px; font-weight: 600; margin: 0 0 4px 0;">${analysis.sourceName}</p>
        <h3 style="color: #FFFFFF; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">${analysis.episodeTitle}</h3>
        <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6; margin: 0;">${analysis.summary}</p>
        ${keyPointsHtml}
        ${stocksHtml ? `
          <div style="margin-top: 12px;">
            <p style="color: #CBD5E1; font-size: 12px; font-weight: 600; margin: 0 0 8px 0;">STOCKS MENTIONED</p>
            <div>${stocksHtml}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0F172A; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #334155; border-radius: 16px; padding: 32px; border: 1px solid #475569;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 28px;">
      <img src="${baseUrl}/icon.png" width="48" height="48" alt="懶懶財經速報" style="border-radius: 10px; display: inline-block; margin-bottom: 14px;" />
      <h1 style="color: #FFFFFF; font-size: 24px; font-weight: 700; margin: 0 0 8px 0;">歡迎加入懶懶財經速報！</h1>
      <p style="color: #CBD5E1; font-size: 14px; margin: 0;">你的 AI 投資 Podcast 及 YouTube 摘要助手</p>
    </div>

    <!-- Timeline -->
    <div style="margin-bottom: 24px;">
      <p style="color: #FFFFFF; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">接下來會發生什麼？</p>
      <div style="border-left: 2px solid #64748B; padding-left: 20px; margin-left: 8px;">
        <div style="margin-bottom: 16px;">
          <p style="color: #10B981; font-size: 14px; font-weight: 600; margin: 0;">現在</p>
          <p style="color: #E2E8F0; font-size: 14px; margin: 4px 0 0 0;">你已成功註冊！</p>
        </div>
        <div style="margin-bottom: 16px;">
          <p style="color: #F59E0B; font-size: 14px; font-weight: 600; margin: 0;">前 7 天</p>
          <p style="color: #E2E8F0; font-size: 14px; margin: 4px 0 0 0;">每天收到最新摘要（免費體驗）</p>
        </div>
        <div>
          <p style="color: #CBD5E1; font-size: 14px; font-weight: 600; margin: 0;">第 8 天起</p>
          <p style="color: #CBD5E1; font-size: 14px; margin: 4px 0 0 0;">免費版改為每週一封・<a href="${baseUrl}/upgrade" style="color: #F59E0B; text-decoration: none;">升級專業版</a>可繼續每天收到</p>
        </div>
      </div>
    </div>

    <!-- Upgrade CTA -->
    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #FBBF24; font-size: 13px; font-weight: 600; margin: 0 0 10px 0;">&#127873; 新用戶限時優惠</p>
      <p style="color: #FFFFFF; font-size: 22px; font-weight: 700; margin: 0 0 4px 0;"><span style="text-decoration: line-through; color: #94A3B8; font-size: 14px; font-weight: 400; margin-right: 8px;">NT$199/月</span>NT$99/月</p>
      <p style="color: #CBD5E1; font-size: 13px; margin: 0 0 18px 0;">前兩個月享半價，升級後每天收到最新摘要</p>
      <a href="${baseUrl}/upgrade" style="display: inline-block; background-color: #F59E0B; color: #0F172A; font-weight: 700; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px;">立即升級 →</a>
      <p style="color: #94A3B8; font-size: 11px; margin: 10px 0 0 0;">7 天內升級才享有此優惠</p>
    </div>

    <!-- Example Section -->
    <div style="margin-bottom: 24px;">
      <hr style="border: none; border-top: 1px solid #475569; margin: 0 0 16px 0;">
      <p style="color: #CBD5E1; font-size: 14px; margin: 0 0 16px 0; text-align: center;">
        以下是你每天會收到的摘要格式範例：
      </p>
      ${exampleContentHtml}
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #475569; margin: 24px 0;">
    <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">
      懶懶財經速報 - AI 自動摘要投資 Podcast 及 YouTube<br>
      <a href="${magicLinkUrl}" style="color: #94A3B8; text-decoration: underline;">管理訂閱</a>
    </p>
  </div>
</body>
</html>
`;
}
