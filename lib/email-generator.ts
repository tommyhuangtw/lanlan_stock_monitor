/**
 * Email HTML Generator
 * Matching n8n workflow "生成確定性 HTML 區塊" + "組裝Email"
 */

import { ConsolidatedReport } from './openrouter';
import type { MarketBrief } from './stock-research';

// Platform links for podcast/YouTube shows
const PLATFORM_LINKS: Record<string, { apple?: string; spotify?: string; kkbox?: string; youtube?: string }> = {
  '股癌': {
    apple: 'https://podcasts.apple.com/us/podcast/gooaye-%E8%82%A1%E7%99%8C/id1500839292',
    spotify: 'https://open.spotify.com/show/1zWxx5pKk0XBEzMupVC7UZ',
    kkbox: 'https://podcast.kkbox.com/sg/channel/0ogFO_N3A9IEgjUEhY',
  },
  '航海王': {
    apple: 'https://podcasts.apple.com/gh/podcast/%E7%BE%8E%E8%82%A1%E8%88%AA%E6%B5%B7%E7%8E%8B/id1689219140',
    spotify: 'https://open.spotify.com/show/16unn8TIxj7OQ2exSd0NPk',
    kkbox: 'https://podcast.kkbox.com/sg/channel/P_WUCQ1b7808qRJRVC',
  },
  '韭菜': {
    apple: 'https://podcasts.apple.com/us/podcast/%E9%9F%AD%E8%8F%9C%E7%95%A2%E6%A5%AD%E7%8F%AD/id1711618619',
    spotify: 'https://open.spotify.com/show/66ENh5UtNA3pPNOT0IZjO1',
    kkbox: 'https://podcast.kkbox.com/tw/channel/_Xr8gNm40P-sxy2TQw',
  },
  '珍妮': {
    apple: 'https://podcasts.apple.com/us/podcast/%E7%BE%8E%E8%82%A1%E6%8A%95%E8%B3%87%E5%AD%B8-%E8%B2%A1%E5%A5%B3%E7%8F%8D%E5%A6%AE/id1546879892',
    spotify: 'https://open.spotify.com/show/3dTKJkvceKNHaYoh7Przbg',
    kkbox: 'https://podcast.kkbox.com/tw/channel/0rQ3Nqkt3BhkWsKc3Y',
  },
  '皓角': {
    apple: 'https://podcasts.apple.com/us/podcast/%E6%B8%B8%E5%BA%AD%E7%9A%93%E7%9A%84%E8%B2%A1%E7%B6%93%E7%9A%93%E8%A7%92/id1488295306',
    spotify: 'https://open.spotify.com/show/1HOGxT9M7a6kpcDi4q27Q7',
    kkbox: 'https://podcast.kkbox.com/sg/channel/P_QhqQ1b7808pZTCQ0',
  },
};

function findPlatformLinks(podcastName: string) {
  const name = podcastName.toLowerCase();
  for (const [keyword, links] of Object.entries(PLATFORM_LINKS)) {
    if (name.includes(keyword)) return links;
  }
  return null;
}

function escHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  return `<div style="margin-top:8px;padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0;font-size:12px;color:#78350f;"><span style="font-weight:600;">💬 KOL 提及價位：</span>${escHtml(pl)}</div>`;
}

/** Ad slot configuration for future ad insertion */
export interface AdSlotConfig {
  enabled: boolean;
  position: 'top' | 'mid' | 'bottom';
  html: string;
}

export interface HtmlBlocks {
  header: string;
  thermometer: string;
  bullCount: number;
  bearCount: number;
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ailanbao.org';
  const header = `<div style="background:#fef3c7;border-bottom:2px solid #f59e0b;padding:10px 16px;border-radius:12px 12px 0 0;text-align:center;"><p style="margin:0;font-size:12px;color:#92400e;font-weight:600;">⚠️ 本服務為資訊彙整工具，內容來自 KOL 公開發言，不構成投資建議</p></div><div style="background:linear-gradient(135deg,#1e3a5f 0%,#234e78 50%,#2a6298 100%);padding:32px 16px;text-align:center;"><div style="margin-bottom:8px;"><img src="${appUrl}/icon.png" width="48" height="48" alt="懶懶財經速報" style="border-radius:10px;display:inline-block;" /></div><h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;letter-spacing:1px;">懶懶財經速報</h1><p style="color:#ffffff;margin:8px 0 0;font-size:15px;font-weight:500;">${escHtml(date)} ｜ 分析 ${totalSources} 個來源</p></div>`;

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
            const actionText = s.action.startsWith('已') ? s.action : `表達${s.action}`;
            sourcesHtml += ` <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;color:#0369a1;background:#e0f2fe;margin-left:4px;">${escHtml(actionText)}</span>`;
          }
          sourcesHtml += ` ${confidenceBadge(s.confidence)}</div>`;
        }
      }
      cards += `<div style="border-left:4px solid #27ae60;background:#fff;padding:16px;margin-bottom:12px;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="display:flex;align-items:center;flex-wrap:wrap;"><span style="font-size:18px;font-weight:700;color:#27ae60;">${escHtml(sig.ticker)}</span>${consensusBadge(sig.consensus)}${timeHorizonTag(sig.timeHorizon)}</div><div style="margin-top:8px;">${sourcesHtml}</div>${priceLevelBlock(sig.priceLevel)}</div>`;
    }
    bullishHtml = `<div style="padding:20px 16px;"><h2 style="color:#16a34a;font-size:18px;margin:0 0 4px;">📊 KOL 看多觀點 (${bullish.length})</h2><p style="font-size:11px;color:#64748b;margin:0 0 16px;font-style:italic;">以下為 KOL 在節目中提及的看多標的，僅供參考比對</p>${cards}</div>`;
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
            const actionText = s.action.startsWith('已') ? s.action : `表達${s.action}`;
            sourcesHtml += ` <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;color:#0369a1;background:#e0f2fe;margin-left:4px;">${escHtml(actionText)}</span>`;
          }
          sourcesHtml += ` ${confidenceBadge(s.confidence)}</div>`;
        }
      }
      const divergence = sig.divergence
        ? `<div style="margin-top:6px;padding:6px 10px;background:#fff3cd;border-radius:6px;font-size:12px;color:#856404;">⚡ 分歧：${escHtml(sig.divergence)}</div>`
        : '';
      cards += `<div style="border-left:4px solid #e74c3c;background:#fff;padding:16px;margin-bottom:12px;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="display:flex;align-items:center;flex-wrap:wrap;"><span style="font-size:18px;font-weight:700;color:#e74c3c;">${escHtml(sig.ticker)}</span>${consensusBadge(sig.consensus)}${timeHorizonTag(sig.timeHorizon)}</div><div style="margin-top:8px;">${sourcesHtml}</div>${divergence}${priceLevelBlock(sig.priceLevel)}</div>`;
    }
    bearishHtml = `<div style="padding:20px 16px;"><h2 style="color:#dc2626;font-size:18px;margin:0 0 4px;">📊 KOL 看空觀點 (${bearish.length})</h2><p style="font-size:11px;color:#64748b;margin:0 0 16px;font-style:italic;">以下為 KOL 在節目中提及的看空標的，僅供參考比對</p>${cards}</div>`;
  }

  // Risk alerts
  let riskHtml = '';
  if (risks.length > 0) {
    let items = '';
    for (const r of risks) {
      items += `<li style="margin-bottom:6px;font-size:14px;color:#333;line-height:1.6;">${escHtml(r)}</li>`;
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
    // Sort episodes: 財經浩角翔起 first, Gooaye/股癌 second, 娜娜說美股 last, others in middle
    const sortedEpisodes = [...episodes].sort((a, b) => {
      const priority = (ep: typeof a): number => {
        const name = ep.podcast.toLowerCase();
        if (name.includes('皓角') || name.includes('財經') || name.includes('finance-horn')) return 0;
        if (name.includes('gooaye') || name.includes('股癌')) return 1;
        if (name.includes('nana') || name.includes('娜娜')) return 9;
        return 5;
      };
      return priority(a) - priority(b);
    });

    let cards = '';
    for (const ep of sortedEpisodes) {
      // Detect YouTube by source field OR by podcast name keywords
      const podcastLower = ep.podcast.toLowerCase();
      const isYoutube = ep.source === 'youtube' || podcastLower.includes('nick') || podcastLower.includes('nana') || podcastLower.includes('娜娜') || podcastLower.includes('陽光');
      const icon = isYoutube ? '🎬' : '🎧';
      const summaryText = ep.detailedSummary || ep.oneLiner || '';

      // --- Highlights with green dots ---
      let highlightsHtml = '';
      if (ep.highlights && ep.highlights.length > 0) {
        let hItems = '';
        for (const h of ep.highlights) {
          hItems += `<div style="margin:0 0 10px;padding:0 0 0 24px;position:relative;font-size:14px;color:#333;line-height:1.6;"><span style="position:absolute;left:0;top:2px;color:#27ae60;font-size:14px;">●</span>${escHtml(h)}</div>`;
        }
        highlightsHtml = `<div style="margin-top:16px;">${hItems}</div>`;
      }

      // --- Detailed summary in grey box ---
      const summaryHtml = summaryText
        ? `<div style="margin-top:12px;padding:14px 16px;background:#f5f5f5;border-radius:8px;font-size:13px;color:#555;line-height:1.7;">${escHtml(summaryText)}</div>`
        : '';

      const safeLink = ep.episodeLink && /^https?:\/\//.test(ep.episodeLink) ? ep.episodeLink : '';

      // --- Footer: unified button style + platform links ---
      const platformLinks = findPlatformLinks(ep.podcast);
      const btnColor = '#334155';
      let footerHtml: string;

      if (isYoutube && safeLink) {
        // YouTube: button linking to the video
        footerHtml = `<div style="margin-top:16px;"><a href="${escHtml(safeLink)}" target="_blank" style="display:block;padding:12px 16px;background:${btnColor};color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center;">🎬 前往觀看</a></div>`;
      } else if (platformLinks) {
        // Podcast with platform links: button + text links below
        const firstLink = platformLinks.apple || platformLinks.spotify || platformLinks.kkbox || safeLink;
        const btnHref = safeLink || firstLink || '';
        const btnHtml = btnHref
          ? `<a href="${escHtml(btnHref)}" target="_blank" style="display:block;padding:12px 16px;background:${btnColor};color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center;">🎧 前往收聽</a>`
          : '';
        // Build "在 Apple Podcasts、Spotify、KKBOX 收聽" with clickable platform names
        const linkStyle = 'color:#64748b;text-decoration:underline;';
        const platformTextParts: string[] = [];
        if (platformLinks.apple) platformTextParts.push(`<a href="${platformLinks.apple}" target="_blank" style="${linkStyle}">Apple Podcasts</a>`);
        if (platformLinks.spotify) platformTextParts.push(`<a href="${platformLinks.spotify}" target="_blank" style="${linkStyle}">Spotify</a>`);
        if (platformLinks.kkbox) platformTextParts.push(`<a href="${platformLinks.kkbox}" target="_blank" style="${linkStyle}">KKBOX</a>`);
        const platformText = platformTextParts.length > 0
          ? `<p style="margin:8px 0 0;font-size:11px;color:#94a3b8;text-align:center;">也可以在 ${platformTextParts.join('、')} 收聽</p>`
          : '';
        footerHtml = `<div style="margin-top:16px;">${btnHtml}${platformText}</div>`;
      } else if (safeLink) {
        // Fallback: generic listen button
        footerHtml = `<div style="margin-top:16px;"><a href="${escHtml(safeLink)}" target="_blank" style="display:block;padding:12px 16px;background:${btnColor};color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center;">🎧 前往收聽</a></div>`;
      } else {
        footerHtml = '';
      }

      // --- Card assembly (matching old screenshot style) ---
      cards += `<div style="background:#fff;padding:20px 16px;margin-bottom:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">` +
        `<div style="display:flex;align-items:center;flex-wrap:wrap;margin-bottom:4px;">` +
          `<span style="font-size:24px;margin-right:10px;">${icon}</span>` +
          `<div style="min-width:0;flex:1;">` +
            `<div style="font-size:17px;font-weight:700;color:#333;word-break:break-word;">${escHtml(ep.podcast)}</div>` +
            `<div style="font-size:13px;color:#888;margin-top:2px;word-break:break-word;">${escHtml(ep.episode)}</div>` +
          `</div>` +
        `</div>` +
        highlightsHtml +
        summaryHtml +
        footerHtml +
      `</div>`;
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
  const footer = `<div style="padding:24px 16px;background:#f8f9fa;border-radius:0 0 12px 12px;">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
      <p style="font-size:14px;color:#334155;margin:0 0 12px;">覺得實用嗎？分享給也在關注投資理財的朋友 👇</p>
      <a href="${appUrl}" target="_blank" style="display:inline-block;padding:10px 28px;background:#334155;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">📮 邀請朋友訂閱</a>
      <div style="border-top:1px dashed #cbd5e1;margin:16px 0 12px;"></div>
      <div style="margin-bottom:8px;"><img src="${appUrl}/ailanbao-logo.png" width="36" height="36" alt="AI懶人報" style="border-radius:50%;display:inline-block;" /></div>
      <p style="margin:0 0 8px;font-size:12px;color:#64748b;">追蹤 AI懶人報</p>
      <div>
        <a href="https://portaly.cc/ailrb" target="_blank" style="display:inline-block;text-decoration:none;margin:0 6px 6px;text-align:center;"><img src="${appUrl}/platforms/portaly.png" width="28" height="28" alt="Portaly" style="display:block;margin:0 auto 2px;border-radius:6px;" /><span style="font-size:10px;color:#64748b;">Portaly</span></a>
        <a href="https://www.threads.com/@ai.lanrenbao" target="_blank" style="display:inline-block;text-decoration:none;margin:0 6px 6px;text-align:center;"><img src="${appUrl}/platforms/threads.png" width="28" height="28" alt="Threads" style="display:block;margin:0 auto 2px;border-radius:6px;" /><span style="font-size:10px;color:#64748b;">Threads</span></a>
        <a href="https://www.instagram.com/ai.lanrenbao/" target="_blank" style="display:inline-block;text-decoration:none;margin:0 6px 6px;text-align:center;"><img src="${appUrl}/platforms/instagram.png" width="28" height="28" alt="Instagram" style="display:block;margin:0 auto 2px;border-radius:6px;" /><span style="font-size:10px;color:#64748b;">IG</span></a>
        <a href="https://www.youtube.com/@ai.lanrenbao" target="_blank" style="display:inline-block;text-decoration:none;margin:0 6px 6px;text-align:center;"><img src="${appUrl}/platforms/youtube.png" width="28" height="28" alt="YouTube" style="display:block;margin:0 auto 2px;border-radius:6px;" /><span style="font-size:10px;color:#64748b;">YouTube</span></a>
      </div>
    </div>
    <div style="background:#fff;border:2px solid #f59e0b;border-radius:10px;padding:16px;margin-bottom:14px;">
      <p style="font-size:13px;color:#92400e;margin:0 0 10px;font-weight:700;">⚠️ 重要聲明</p>
      <ul style="margin:0;padding-left:22px;font-size:11px;color:#78350f;line-height:1.7;">
        <li>本服務為獨立第三方資訊工具，與任何節目創作者<strong>無關聯、合作或背書關係</strong></li>
        <li>所有內容由 AI 自動生成，可能存在理解偏差或技術錯誤</li>
        <li>本服務僅彙整 KOL 公開發言，<strong>不構成投資建議</strong></li>
        <li>投資決策應基於您自己的研究判斷，本服務不對投資結果負責</li>
        <li>所有內容版權歸原節目創作者所有</li>
      </ul>
    </div>
    <p style="font-size:10px;color:#94a3b8;margin:0;text-align:center;">由懶懶財經速報自動產生 · <a href="${appUrl}/terms" style="color:#94a3b8;text-decoration:underline;">服務條款</a></p>
  </div>`;

  return {
    header,
    thermometer,
    bullCount,
    bearCount,
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
 * Build integrated "今日總覽" section combining thermometer, quick digest, and market brief.
 */
function buildOverviewSection(
  blocks: HtmlBlocks,
  quickDigest: string[],
  marketMood: string,
  marketBrief?: MarketBrief,
): string {
  const { bullCount, bearCount } = blocks;
  const total = bullCount + bearCount || 1;
  const bullPct = Math.round((bullCount / total) * 100);
  const bearPct = 100 - bullPct;

  // Thermometer bar
  const thermometerBar = `
    <div style="margin-bottom:4px;">
      <div style="display:flex;align-items:center;">
        <span style="font-size:13px;color:#16a34a;font-weight:700;margin-right:8px;white-space:nowrap;">看漲 ${bullCount}</span>
        <div style="flex:1;min-width:0;height:22px;border-radius:11px;overflow:hidden;display:flex;background:#e2e8f0;">
          <div style="width:${bullPct}%;background:linear-gradient(90deg,#22c55e,#4ade80);height:100%;"></div>
          <div style="width:${bearPct}%;background:linear-gradient(90deg,#ef4444,#f87171);height:100%;"></div>
        </div>
        <span style="font-size:13px;color:#dc2626;font-weight:700;margin-left:8px;white-space:nowrap;">看空 ${bearCount}</span>
      </div>
    </div>`;

  const moodLine = marketMood
    ? `<div style="font-size:14px;color:#64748b;font-style:italic;text-align:center;margin-top:6px;">「${escHtml(marketMood)}」</div>`
    : '';

  // Quick digest bullets
  let quickDigestBlock = '';
  if (quickDigest.length > 0) {
    let items = '';
    for (const point of quickDigest) {
      items += `<li style="margin-bottom:10px;font-size:15px;color:#334155;line-height:1.6;list-style:none;padding-left:22px;position:relative;">
        <span style="position:absolute;left:0;top:2px;color:#ca8a04;">⚡</span>${escHtml(point)}
      </li>`;
    }
    quickDigestBlock = `
      <div style="border-top:1px solid #e2e8f0;margin:16px 0;"></div>
      <div>
        <div style="font-size:14px;font-weight:700;color:#334155;margin:0 0 10px;">⚡ 快速重點</div>
        <ul style="margin:0;padding:0;">${items}</ul>
      </div>`;
  }

  // Market brief bullets
  let marketBriefBlock = '';
  if (marketBrief?.content) {
    const lines = marketBrief.content.split('\n').filter(l => l.trim());
    let itemsHtml = '';
    for (const line of lines) {
      if (!/^[•\-\*]/.test(line.trim())) continue;
      const text = line.replace(/^[•\-\*]\s*/, '').trim();
      if (!text) continue;
      const titleMatch = text.match(/^\*\*(.+?)\*\*[：:]\s*(.*)/);
      let rendered: string;
      if (titleMatch) {
        rendered = `<strong style="color:#0f172a;">${escHtml(titleMatch[1])}</strong><span style="color:#64748b;">：${escHtml(titleMatch[2])}</span>`;
      } else {
        rendered = `<span style="color:#334155;">${escHtml(text)}</span>`;
      }
      itemsHtml += `<li style="margin-bottom:8px;font-size:13px;line-height:1.6;">${rendered}</li>`;
    }
    if (itemsHtml) {
      marketBriefBlock = `
        <div style="border-top:1px solid #e2e8f0;margin:16px 0;"></div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#2563eb;margin:0 0 10px;">🌐 全球財經動態</div>
          <ul style="margin:0;padding-left:18px;color:#334155;">${itemsHtml}</ul>
          <div style="margin-top:8px;font-size:10px;color:#94a3b8;font-style:italic;">由 AI 自動整理最新財經情報</div>
        </div>`;
    }
  }

  // If nothing to show, return empty
  const hasContent = quickDigest.length > 0 || marketBrief?.content;
  if (!hasContent && bullCount === 0 && bearCount === 0) return '';

  return `
  <div style="padding:20px 16px;">
    <div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;font-size:18px;font-weight:700;margin:0 0 14px;">📊 今日總覽</h2>
      ${thermometerBar}
      ${moodLine}
      ${quickDigestBlock}
      ${marketBriefBlock}
    </div>
  </div>`;
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
  unsubscribeLinkUrl?: string,
  marketBrief?: MarketBrief,
  adSlots?: AdSlotConfig[],
): string {
  // Build integrated "今日總覽" overview section
  const overviewHtml = buildOverviewSection(blocks, quickDigest, marketMood, marketBrief);

  // Unsubscribe link (integrated into footer bottom)
  const unsubscribeHtml = unsubscribeLinkUrl
    ? `<div style="padding:12px 20px;text-align:center;">
        <a href="${escHtml(unsubscribeLinkUrl)}" style="font-size:11px;color:#94a3b8;text-decoration:underline;">取消訂閱</a>
       </div>`
    : '';

  // Section divider for visual rhythm
  const divider = '<div style="padding:0 16px;"><div style="border-top:1px solid #e2e8f0;"></div></div>';

  // Resolve ad slots
  const adSlotMap = new Map<string, string>();
  if (adSlots) {
    for (const slot of adSlots) {
      if (slot.enabled && slot.html) {
        adSlotMap.set(slot.position, slot.html);
      }
    }
  }
  const adTop = adSlotMap.get('top') || '<!-- AD_SLOT_TOP -->';
  const adMid = adSlotMap.get('mid') || '<!-- AD_SLOT_MID -->';
  const adBottom = adSlotMap.get('bottom') || '<!-- AD_SLOT_BOTTOM -->';

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
      ${overviewHtml}
      ${adTop}
      ${blocks.bullish}
      ${blocks.bullish && blocks.bearish ? divider : ''}
      ${blocks.bearish}
      ${adMid}
      ${(blocks.bullish || blocks.bearish) && blocks.risk ? divider : ''}
      ${blocks.risk}
      ${blocks.risk && blocks.catalyst ? divider : ''}
      ${blocks.catalyst}
      ${(blocks.risk || blocks.catalyst) && blocks.monitor ? divider : ''}
      ${blocks.monitor}
      ${blocks.monitor && blocks.insights ? divider : ''}
      ${blocks.insights}
      ${blocks.insights && blocks.episodes ? divider : ''}
      ${blocks.episodes}
      ${adBottom}
      ${blocks.footer}
      ${unsubscribeHtml}
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
  marketMood: string,
  marketBrief?: MarketBrief
): string {
  const blocks = generateHtmlBlocks(report);
  return assembleEmail(blocks, quickDigest, marketMood, MAGIC_LINK_PLACEHOLDER, UNSUBSCRIBE_LINK_PLACEHOLDER, marketBrief);
}

/**
 * Inject magic link into cached HTML template
 */
export function injectMagicLinkToHtml(htmlTemplate: string, magicLinkUrl: string, unsubscribeUrl?: string): string {
  let html = htmlTemplate.replace(new RegExp(MAGIC_LINK_PLACEHOLDER, 'g'), magicLinkUrl);
  if (unsubscribeUrl) {
    html = html.replace(new RegExp(UNSUBSCRIBE_LINK_PLACEHOLDER, 'g'), unsubscribeUrl);
  }
  // Strip "管理訂閱設定" link from old cached templates (no longer needed since dashboard was removed)
  // Matches: <a href="...">管理訂閱設定</a> followed by optional " · " separator
  html = html.replace(/<a[^>]*>管理訂閱設定<\/a>\s*(?:·\s*)?/g, '');
  return html;
}
