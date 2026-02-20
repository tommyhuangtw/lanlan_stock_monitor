import { NextResponse } from 'next/server';
import { generateFullEmail } from '@/lib/email-generator';
import { ConsolidatedReport } from '@/lib/openrouter';

// Sample consolidated report for preview
const sampleReport: ConsolidatedReport = {
  date: new Date().toISOString().split('T')[0],
  totalSources: 3,
  bullishSignals: [
    {
      ticker: 'NVDA',
      consensus: 'KOL 共識',
      sources: [
        {
          kol: '股癌',
          reason: 'AI 伺服器需求持續強勁，下半年訂單能見度高',
          action: '加碼',
          confidence: 'high',
        },
        {
          kol: '財經號角',
          reason: '資料中心支出持續成長，競爭對手短期難以追趕',
          action: '持有',
          confidence: 'medium',
        },
      ],
      overallConfidence: 'high',
      timeHorizon: 'medium',
      priceLevel: '目標價 $150，支撐 $110',
    },
    {
      ticker: 'TSM',
      consensus: '',
      sources: [
        {
          kol: '美股航海王',
          reason: '先進製程產能滿載，CoWoS 擴產進度超預期',
          action: '買進',
          confidence: 'high',
        },
      ],
      overallConfidence: 'high',
      timeHorizon: 'long',
      priceLevel: '',
    },
  ],
  bearishSignals: [
    {
      ticker: 'AAPL',
      consensus: '',
      sources: [
        {
          kol: '股癌',
          reason: 'iPhone 16 銷售不如預期，中國市場持續衰退',
          action: '減碼',
          confidence: 'medium',
        },
      ],
      divergence: '',
      overallConfidence: 'medium',
      timeHorizon: 'short',
      priceLevel: '跌破 $200 可能加速下跌',
    },
  ],
  monitorSignals: [
    {
      topic: 'AI PC 換機潮',
      reason: '各大品牌陸續推出 AI PC，但消費者換機意願仍待觀察',
      mentionedBy: ['股癌', '財經號角'],
      timeHorizon: 'medium',
    },
    {
      topic: '日圓走勢',
      reason: '日圓持續貶值，影響日股和亞洲資金流向',
      mentionedBy: ['美股航海王'],
      timeHorizon: 'short',
    },
  ],
  keyInsights: [
    '股癌認為目前 AI 股估值已高，建議分批進場而非追高',
    '財經號角指出聯準會可能在 Q4 降息，有利成長股',
    '美股航海王提醒注意美國大選對市場的潛在影響',
  ],
  riskAlerts: [
    '美國科技股財報季即將到來，若財報不如預期可能引發修正',
    '地緣政治風險：中東局勢升溫可能影響油價和市場情緒',
    '日圓急貶可能導致套利交易平倉，引發短期波動',
  ],
  upcomingCatalysts: [
    {
      date: '2/20',
      event: 'NVIDIA 財報公布',
      tickers: ['NVDA', 'AMD', 'TSM'],
    },
    {
      date: '2/25',
      event: '聯準會會議紀要公布',
      tickers: ['SPY', 'QQQ'],
    },
    {
      date: '3/1',
      event: '台積電法說會',
      tickers: ['TSM', '2330.TW'],
    },
  ],
  episodeSummaries: [
    {
      podcast: '股癌',
      episode: 'EP450｜AI 概念股還能追嗎？台積電法說會重點整理',
      episodeLink: 'https://podcasts.apple.com/podcast/gooaye',
      sentiment: 'moderately_bullish',
      oneLiner: '本集深入分析 AI 概念股投資策略與台積電最新展望',
      detailedSummary: '主持人認為目前 AI 相關個股估值偏高，建議投資人保持謹慎，等待更好的進場點位。同時也提到美國科技股財報季即將到來，可能會影響市場走勢。對於台積電，認為先進製程仍具競爭優勢。',
      highlights: [
        '台積電法說會釋出正面訊號，但股價已反映大部分利多',
        'AI 伺服器需求持續強勁，但要注意庫存週期',
        'NVIDIA 本益比偏高，建議等回檔再進場',
        '建議分批進場，不要追高',
      ],
      source: 'podcast',
    },
    {
      podcast: '財經號角',
      episode: '聯準會利率決策分析｜美股後市展望',
      episodeLink: 'https://soundcloud.com/finance-horn',
      sentiment: 'neutral',
      oneLiner: '深入解析聯準會政策對投資佈局的影響',
      detailedSummary: '深入分析聯準會最新利率決策對市場的影響。討論美國經濟數據、通膨走勢，以及對台股外資動向的可能影響。建議投資人關注即將公布的非農就業數據。',
      highlights: [
        '聯準會維持利率不變，符合市場預期',
        '年底前可能還有一次降息機會',
        '美元走弱有利於新興市場',
        '建議關注公用事業和高股息股',
      ],
      source: 'podcast',
    },
  ],
};

const sampleQuickDigest = [
  'NVIDIA 獲多位 KOL 共識看好，AI 伺服器需求強勁',
  '台積電 CoWoS 擴產超預期，先進製程領先優勢持續',
  'Apple 中國市場疲軟，短期承壓',
  '聯準會 Q4 可能降息，有利成長股表現',
];

const sampleMarketMood = 'AI 主題持續主導，但估值焦慮浮現';

export async function GET() {
  const emailHtml = generateFullEmail(
    sampleReport,
    sampleQuickDigest,
    sampleMarketMood,
    'https://example.com/manage-subscription'
  );

  // Return HTML directly for browser preview
  return new NextResponse(emailHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
