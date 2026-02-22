/**
 * Email HTML Generator
 * Matching n8n workflow "生成確定性 HTML 區塊" + "組裝Email"
 */

import { ConsolidatedReport } from './openrouter';

function escHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeHorizonTag(th: string): string {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    'short': { label: '短線', color: '#e67e22', bg: '#fef3e2' },
    'medium': { label: '中線', color: '#2980b9', bg: '#eaf2f8' },
    'long': { label: '長線', color: '#8e44ad', bg: '#f4ecf7' }
  };
  const cfg = map[th] || map['medium'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:${cfg.color};background:${cfg.bg};margin-left:6px;">${cfg.label}</span>`;
}

function confidenceBadge(c: string): string {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    'high': { label: '高信心', bg: '#d5f5e3', color: '#1e8449' },
    'medium': { label: '中信心', bg: '#fef9e7', color: '#b7950b' },
    'low': { label: '低信心', bg: '#f2f3f4', color: '#7f8c8d' }
  };
  const cfg = map[c] || map['medium'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

function consensusBadge(c: string | undefined): string {
  if (!c) return '';
  if (c.includes('共識')) {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff;background:#27ae60;margin-left:6px;">🤝 ${escHtml(c)}</span>`;
  }
  if (c.includes('分歧')) {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff;background:#e74c3c;margin-left:6px;">⚡ ${escHtml(c)}</span>`;
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;color:#555;background:#eee;margin-left:6px;">${escHtml(c)}</span>`;
}

function priceLevelBlock(pl: string | undefined): string {
  if (!pl || pl === '無' || pl === 'N/A' || pl === '無具體價位' || pl.trim() === '') return '';
  return `<div style="margin-top:8px;padding:6px 10px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#555;">💰 ${escHtml(pl)}</div>`;
}

export interface HtmlBlocks {
  header: string;
  thermometer: string;
  bullish: string;
  bearish: string;
  risk: string;
  catalyst: string;
  monitor: string;
  insights: string;
  episodes: string;
  footer: string;
}

/**
 * Generate deterministic HTML blocks from consolidated report
 * Matching n8n "生成確定性 HTML 區塊" node
 */
export function generateHtmlBlocks(report: ConsolidatedReport): HtmlBlocks {
  const date = report.date || new Date().toISOString().split('T')[0];
  const totalSources = report.totalSources || 0;
  const bullish = report.bullishSignals || [];
  const bearish = report.bearishSignals || [];
  const monitor = report.monitorSignals || [];
  const insights = report.keyInsights || [];
  const risks = report.riskAlerts || [];
  const catalysts = report.upcomingCatalysts || [];
  const episodes = report.episodeSummaries || [];

  // Header
  const header = `<div style="background:linear-gradient(135deg,#1e3a5f 0%,#234e78 50%,#2a6298 100%);padding:32px 16px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;letter-spacing:1px;">📊 懶懶財經速報</h1><p style="color:#ffffff;margin:8px 0 0;font-size:15px;font-weight:500;">${escHtml(date)} ｜ 分析 ${totalSources} 個來源</p></div>`;

  // Bullish signals
  let bullishHtml = '';
  if (bullish.length > 0) {
    let cards = '';
    for (const sig of bullish) {
      let sourcesHtml = '';
      if (sig.sources && Array.isArray(sig.sources)) {
        for (const s of sig.sources) {
          sourcesHtml += `<div style="margin:4px 0;padding:6px 10px;background:#f8f9fa;border-radius:6px;font-size:13px;"><strong>${escHtml(s.kol)}</strong>：${escHtml(s.reason)}`;
          if (s.action && s.action !== '無') {
            sourcesHtml += ` <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;color:#fff;background:#27ae60;margin-left:4px;">${escHtml(s.action)}</span>`;
          }
          sourcesHtml += ` ${confidenceBadge(s.confidence)}</div>`;
        }
      }
      cards += `<div style="border-left:4px solid #27ae60;background:#fff;padding:16px;margin-bottom:12px;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="display:flex;align-items:center;flex-wrap:wrap;"><span style="font-size:18px;font-weight:700;color:#27ae60;">${escHtml(sig.ticker)}</span>${consensusBadge(sig.consensus)}${timeHorizonTag(sig.timeHorizon)}</div><div style="margin-top:8px;">${sourcesHtml}</div>${priceLevelBlock(sig.priceLevel)}</div>`;
    }
    bullishHtml = `<div style="padding:20px 16px;"><h2 style="color:#27ae60;font-size:18px;margin:0 0 16px;">📈 看漲訊號 (${bullish.length})</h2>${cards}</div>`;
  }

  // Bearish signals
  let bearishHtml = '';
  if (bearish.length > 0) {
    let cards = '';
    for (const sig of bearish) {
      let sourcesHtml = '';
      if (sig.sources && Array.isArray(sig.sources)) {
        for (const s of sig.sources) {
          sourcesHtml += `<div style="margin:4px 0;padding:6px 10px;background:#fdf2f2;border-radius:6px;font-size:13px;"><strong>${escHtml(s.kol)}</strong>：${escHtml(s.reason)}`;
          if (s.action && s.action !== '無') {
            sourcesHtml += ` <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;color:#fff;background:#e74c3c;margin-left:4px;">${escHtml(s.action)}</span>`;
          }
          sourcesHtml += ` ${confidenceBadge(s.confidence)}</div>`;
        }
      }
      const divergence = sig.divergence
        ? `<div style="margin-top:6px;padding:6px 10px;background:#fff3cd;border-radius:6px;font-size:12px;color:#856404;">⚡ 分歧：${escHtml(sig.divergence)}</div>`
        : '';
      cards += `<div style="border-left:4px solid #e74c3c;background:#fff;padding:16px;margin-bottom:12px;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="display:flex;align-items:center;flex-wrap:wrap;"><span style="font-size:18px;font-weight:700;color:#e74c3c;">${escHtml(sig.ticker)}</span>${consensusBadge(sig.consensus)}${timeHorizonTag(sig.timeHorizon)}</div><div style="margin-top:8px;">${sourcesHtml}</div>${divergence}${priceLevelBlock(sig.priceLevel)}</div>`;
    }
    bearishHtml = `<div style="padding:20px 16px;"><h2 style="color:#e74c3c;font-size:18px;margin:0 0 16px;">📉 看空訊號 (${bearish.length})</h2>${cards}</div>`;
  }

  // Risk alerts
  let riskHtml = '';
  if (risks.length > 0) {
    let items = '';
    for (const r of risks) {
      items += `<li style="margin-bottom:6px;font-size:14px;color:#721c24;">${escHtml(r)}</li>`;
    }
    riskHtml = `<div style="padding:20px 16px;"><h2 style="color:#c0392b;font-size:18px;margin:0 0 16px;">⚠️ 風險提醒</h2><div style="border-left:4px solid #e74c3c;background:#fdf2f2;padding:16px;border-radius:0 8px 8px 0;"><ul style="margin:0;padding-left:20px;">${items}</ul></div></div>`;
  }

  // Catalysts
  let catalystHtml = '';
  if (catalysts.length > 0) {
    let items = '';
    for (const c of catalysts) {
      const tickers = (c.tickers || [])
        .map(t => `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;color:#2980b9;background:#eaf2f8;margin-left:4px;">${escHtml(t)}</span>`)
        .join('');
      items += `<div style="margin-bottom:10px;"><div style="display:inline-block;padding:4px 10px;border-radius:8px;font-size:13px;font-weight:700;color:#fff;background:#3498db;text-align:center;margin-right:8px;margin-bottom:4px;white-space:nowrap;">${escHtml(c.date)}</div><span style="font-size:14px;color:#333;">${escHtml(c.event)} ${tickers}</span></div>`;
    }
    catalystHtml = `<div style="padding:20px 16px;"><h2 style="color:#2980b9;font-size:18px;margin:0 0 16px;">📅 近期催化劑</h2><div style="background:#eaf6ff;padding:16px;border-radius:8px;">${items}</div></div>`;
  }

  // Monitor signals
  let monitorHtml = '';
  if (monitor.length > 0) {
    let cards = '';
    for (const sig of monitor) {
      const mentionedBy = (sig.mentionedBy || []).map(m => escHtml(m)).join(', ');
      cards += `<div style="border-left:4px solid #f39c12;background:#fff;padding:14px;margin-bottom:10px;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,0.08);"><div style="display:flex;align-items:center;flex-wrap:wrap;"><span style="font-size:16px;font-weight:700;color:#f39c12;">${escHtml(sig.topic)}</span>${timeHorizonTag(sig.timeHorizon)}</div><p style="margin:8px 0 4px;font-size:14px;color:#333;word-break:break-word;">${escHtml(sig.reason)}</p><p style="margin:0;font-size:12px;color:#888;">提及來源：${mentionedBy}</p></div>`;
    }
    monitorHtml = `<div style="padding:20px 16px;"><h2 style="color:#f39c12;font-size:18px;margin:0 0 16px;">👀 值得關注 (${monitor.length})</h2>${cards}</div>`;
  }

  // Key insights
  let insightsHtml = '';
  if (insights.length > 0) {
    let items = '';
    for (const ins of insights) {
      const escaped = escHtml(ins);
      const formatted = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      items += `<li style="margin-bottom:8px;font-size:14px;color:#333;">${formatted}</li>`;
    }
    insightsHtml = `<div style="padding:20px 16px;"><h2 style="color:#8e44ad;font-size:18px;margin:0 0 16px;">💡 KOL 獨特觀點</h2><div style="background:#f9f5ff;padding:16px;border-radius:8px;border-left:4px solid #8e44ad;"><ul style="margin:0;padding-left:20px;">${items}</ul></div></div>`;
  }

  // Episode summaries
  let episodesHtml = '';
  if (episodes.length > 0) {
    let cards = '';
    for (const ep of episodes) {
      const icon = ep.source === 'youtube' ? '🎬' : '🎧';
      const linkColor = ep.source === 'youtube' ? '#e74c3c' : '#8e44ad';
      const linkText = ep.source === 'youtube' ? '🎬 前往觀看' : '🎧 前往收聽';

      let highlightsHtml = '';
      if (ep.highlights && ep.highlights.length > 0) {
        let hItems = '';
        for (const h of ep.highlights) {
          hItems += `<li style="margin-bottom:6px;font-size:14px;color:#333;list-style:none;padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:#27ae60;">●</span>${escHtml(h)}</li>`;
        }
        highlightsHtml = `<ul style="margin:12px 0;padding:0;">${hItems}</ul>`;
      }

      const summaryText = ep.detailedSummary || ep.oneLiner || '';
      const summaryHtml = summaryText
        ? `<div style="margin-top:10px;padding:12px;background:#f8f9fa;border-radius:6px;font-size:13px;color:#555;line-height:1.6;word-break:break-word;">${escHtml(summaryText)}</div>`
        : '';

      const linkBtn = ep.episodeLink
        ? `<div style="margin-top:14px;text-align:center;"><a href="${escHtml(ep.episodeLink)}" target="_blank" style="display:block;padding:10px 24px;background:${linkColor};color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center;max-width:100%;">${linkText}</a></div>`
        : '';

      cards += `<div style="background:#fff;padding:20px 16px;margin-bottom:16px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);"><div style="display:flex;align-items:center;flex-wrap:wrap;margin-bottom:4px;"><span style="font-size:24px;margin-right:10px;">${icon}</span><div style="min-width:0;flex:1;"><div style="font-size:16px;font-weight:700;color:#333;word-break:break-word;">${escHtml(ep.podcast)}</div><div style="font-size:13px;color:#888;margin-top:2px;word-break:break-word;">${escHtml(ep.episode)}</div></div></div>${highlightsHtml}${summaryHtml}${linkBtn}</div>`;
    }
    episodesHtml = `<div style="padding:20px 16px;"><h2 style="color:#333;font-size:18px;margin:0 0 16px;">🎧🎬 節目重點摘要</h2>${cards}</div>`;
  }

  // Thermometer
  const bullCount = bullish.length;
  const bearCount = bearish.length;
  const total = bullCount + bearCount || 1;
  const bullPct = Math.round((bullCount / total) * 100);
  const bearPct = 100 - bullPct;
  const thermometer = `<div style="padding:20px 16px;"><h2 style="color:#333;font-size:18px;margin:0 0 12px;">🌡️ 市場溫度計</h2><div style="display:flex;align-items:center;margin-bottom:8px;"><span style="font-size:13px;color:#27ae60;font-weight:600;margin-right:6px;white-space:nowrap;">看漲 ${bullCount}</span><div style="flex:1;min-width:0;height:24px;border-radius:12px;overflow:hidden;display:flex;background:#eee;"><div style="width:${bullPct}%;background:linear-gradient(90deg,#27ae60,#2ecc71);height:100%;"></div><div style="width:${bearPct}%;background:linear-gradient(90deg,#e74c3c,#c0392b);height:100%;"></div></div><span style="font-size:13px;color:#e74c3c;font-weight:600;margin-left:6px;white-space:nowrap;">看空 ${bearCount}</span></div><div id="market-mood" style="font-size:14px;color:#555;font-style:italic;text-align:center;"></div></div>`;

  // Footer
  const footer = `<div style="padding:20px 16px;background:#f8f9fa;border-radius:0 0 12px 12px;text-align:center;"><p style="font-size:12px;color:#999;margin:0;">⚠️ 此報告由 AI 自動生成，僅供參考，不構成投資建議。投資有風險，請自行判斷。</p><p style="font-size:11px;color:#bbb;margin:6px 0 0;">由懶懶財經速報系統自動產生</p></div>`;

  return {
    header,
    thermometer,
    bullish: bullishHtml,
    bearish: bearishHtml,
    risk: riskHtml,
    catalyst: catalystHtml,
    monitor: monitorHtml,
    insights: insightsHtml,
    episodes: episodesHtml,
    footer,
  };
}

/**
 * Assemble full email HTML
 * Matching n8n "組裝Email" node
 */
export function assembleEmail(
  blocks: HtmlBlocks,
  quickDigest: string[],
  marketMood: string,
  manageLinkUrl?: string,
  unsubscribeLinkUrl?: string
): string {
  // Generate quick digest HTML
  let quickDigestHtml = '';
  if (quickDigest.length > 0) {
    let items = '';
    for (const point of quickDigest) {
      items += `<li style="margin-bottom:12px; font-size:16px; color:#333333; line-height:1.6; list-style:none; padding-left:24px; position:relative;">
                <span style="position:absolute; left:0; top:2px;">⚡</span>${escHtml(point)}
              </li>`;
    }
    quickDigestHtml = `
    <div style="padding:16px;">
      <div style="border-left:4px solid #6366f1; padding:20px; border-radius:0 12px 12px 0;">
        <h2 style="color:#1a1a2e; font-size:18px; margin:0 0 16px; font-weight:bold;">⚡ 今日快速重點</h2>
        <ul style="margin:0; padding:0;">${items}</ul>
      </div>
    </div>`;
  }

  // Add market mood to thermometer
  let thermometerHtml = blocks.thermometer;
  if (marketMood && thermometerHtml) {
    thermometerHtml = thermometerHtml.replace(
      '<div id="market-mood" style="font-size:14px;color:#555;font-style:italic;text-align:center;"></div>',
      `<div style="font-size:15px; color:#555; font-style:italic; text-align:center; margin-top:10px; padding:0 10px;">「${escHtml(marketMood)}」</div>`
    );
  }

  // Add manage subscription link section
  const unsubscribeHtml = unsubscribeLinkUrl
    ? ` · <a href="${escHtml(unsubscribeLinkUrl)}" style="font-size:12px;color:#999;text-decoration:underline;">取消訂閱</a>`
    : '';
  const manageLinkHtml = manageLinkUrl
    ? `<div style="padding:16px 20px;text-align:center;border-top:1px solid #eee;">
        <a href="${escHtml(manageLinkUrl)}" style="font-size:13px;color:#666;text-decoration:underline;">管理訂閱設定</a>${unsubscribeHtml}
       </div>`
    : '';

  const fullEmail = `
<!DOCTYPE html>
<html lang="zh-TW" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>懶懶財經速報</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }

    /* Reset */
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }

    /* Mobile */
    @media only screen and (max-width: 600px) {
      .main-card { width: 100% !important; border-radius: 0 !important; margin: 0 !important; }
      .content-cell { padding: 10px !important; }
    }

    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      body { background-color: #121212 !important; }
      .main-card { background-color: #1c1c1e !important; }
      .text-dark { color: #eeeeee !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f7f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <center>
    <div class="main-card" style="max-width:600px; width:100%; margin:20px auto; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08); text-align:left;">
      ${blocks.header}
      <!-- CTA_INJECTION_POINT -->
      ${quickDigestHtml}
      ${thermometerHtml}
      ${blocks.bullish}
      ${blocks.bearish}
      ${blocks.risk}
      ${blocks.catalyst}
      ${blocks.monitor}
      ${blocks.insights}
      ${blocks.episodes}
      ${manageLinkHtml}
      ${blocks.footer}
    </div>
  </center>
</body>
</html>`;

  return fullEmail;
}

/**
 * Generate complete email from consolidated report
 * Combines generateHtmlBlocks + assembleEmail
 */
export function generateFullEmail(
  report: ConsolidatedReport,
  quickDigest: string[],
  marketMood: string,
  manageLinkUrl?: string,
  unsubscribeLinkUrl?: string
): string {
  const blocks = generateHtmlBlocks(report);
  return assembleEmail(blocks, quickDigest, marketMood, manageLinkUrl, unsubscribeLinkUrl);
}

// =============================================
// Template Caching Functions
// =============================================

/** Magic link placeholder used in templates */
export const MAGIC_LINK_PLACEHOLDER = '{{MAGIC_LINK_URL}}';
export const UNSUBSCRIBE_LINK_PLACEHOLDER = '{{UNSUBSCRIBE_URL}}';

/**
 * Generate HTML template without magic link (for caching)
 * Uses placeholder that can be replaced later
 */
export function generateHtmlTemplateWithoutMagicLink(
  report: ConsolidatedReport,
  quickDigest: string[],
  marketMood: string
): string {
  const blocks = generateHtmlBlocks(report);
  return assembleEmail(blocks, quickDigest, marketMood, MAGIC_LINK_PLACEHOLDER, UNSUBSCRIBE_LINK_PLACEHOLDER);
}

/**
 * Inject magic link into cached HTML template
 */
export function injectMagicLinkToHtml(htmlTemplate: string, magicLinkUrl: string, unsubscribeUrl?: string): string {
  let html = htmlTemplate.replace(new RegExp(MAGIC_LINK_PLACEHOLDER, 'g'), magicLinkUrl);
  if (unsubscribeUrl) {
    html = html.replace(new RegExp(UNSUBSCRIBE_LINK_PLACEHOLDER, 'g'), unsubscribeUrl);
  }
  return html;
}
