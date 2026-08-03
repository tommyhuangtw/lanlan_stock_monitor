/**
 * Independent health check.
 *
 * The failure alerts in daily-pipeline and stock-monitor are sent from inside
 * those jobs, so they can only report problems the job survived long enough to
 * notice. If a job never starts, nothing reports anything and the silence looks
 * exactly like success. That happens for real: GitHub delays scheduled runs
 * (one 03:00 cron here fired at 06:29), and disables scheduled workflows
 * entirely after 60 days without a commit.
 *
 * So this runs on its own schedule and checks outcomes rather than execution —
 * is the data still arriving? — and emails if it isn't.
 *
 * Run: npx tsx scripts/health-check.ts
 */
import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';
import { sendPipelineAlert } from '../lib/notifications/email-alert';

const HOUR = 3600_000;

/** Analyses should land daily; 36h tolerates a late or slow run. */
const ANALYSIS_MAX_AGE_H = 36;
/** Alerts only fire on weekdays; 48h absorbs a single market holiday. */
const ALERT_MAX_AGE_H = 48;
/** Below this the watchlist has been wiped rather than merely pruned. */
const MIN_ACTIVE_STOCKS = 10;

async function latestTimestamp(table: string, column: string): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1);
  const value = (data?.[0] as Record<string, string> | undefined)?.[column];
  return value ? new Date(value) : null;
}

function hoursAgo(d: Date | null): number | null {
  return d ? Math.round((Date.now() - d.getTime()) / HOUR) : null;
}

async function main() {
  const problems: string[] = [];
  const lines: string[] = [];
  const now = new Date();
  // 0 = Sunday. Alerts are only produced on weekday runs.
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;

  // 1. Is the content pipeline still producing analyses?
  const lastAnalysis = await latestTimestamp('analyses', 'created_at');
  const analysisAge = hoursAgo(lastAnalysis);
  lines.push(`最後一筆分析：${analysisAge === null ? '從未' : analysisAge + ' 小時前'}`);
  if (analysisAge === null || analysisAge > ANALYSIS_MAX_AGE_H) {
    problems.push(`分析已 ${analysisAge ?? '∞'} 小時沒有新增（門檻 ${ANALYSIS_MAX_AGE_H} 小時）— daily-pipeline 可能沒有執行`);
  }

  // 2. Is the monitor still producing signals on trading days?
  const lastAlert = await latestTimestamp('stock_alerts', 'created_at');
  const alertAge = hoursAgo(lastAlert);
  lines.push(`最後一筆股價訊號：${alertAge === null ? '從未' : alertAge + ' 小時前'}`);
  if (isWeekday && (alertAge === null || alertAge > ALERT_MAX_AGE_H)) {
    problems.push(`股價訊號已 ${alertAge ?? '∞'} 小時沒有新增（門檻 ${ALERT_MAX_AGE_H} 小時）— stock-monitor 可能沒有執行`);
  }

  // 3. Did the watchlist survive the last cleanup?
  const { count: activeStocks } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  lines.push(`監控中股票：${activeStocks ?? 0} 檔`);
  if ((activeStocks ?? 0) < MIN_ACTIVE_STOCKS) {
    problems.push(`監控池只剩 ${activeStocks ?? 0} 檔（門檻 ${MIN_ACTIVE_STOCKS}）— 清理規則可能誤刪`);
  }

  // 4. Are prices still refreshing for the stocks we do track?
  const { count: stalePrices } = await supabaseAdmin
    .from('watchlist_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .or(`last_price_update.is.null,last_price_update.lt.${new Date(Date.now() - 72 * HOUR).toISOString()}`);
  lines.push(`超過 72 小時沒更新價格：${stalePrices ?? 0} 檔`);
  if ((stalePrices ?? 0) > 0 && (activeStocks ?? 0) > 0 && (stalePrices ?? 0) === activeStocks) {
    problems.push('所有股票的價格都超過 72 小時未更新 — 價格抓取可能整個失效');
  }

  console.log('=== 健康檢查 ===');
  for (const l of lines) console.log(`  ${l}`);

  if (problems.length === 0) {
    console.log('\n✅ 一切正常');
    return;
  }

  console.error(`\n❌ ${problems.length} 項異常：`);
  for (const p of problems) console.error(`  - ${p}`);

  await sendPipelineAlert({
    job: '系統健康檢查',
    headline: `偵測到 ${problems.length} 項異常 — 排程可能沒有執行`,
    errors: [...problems, '', '目前狀態：', ...lines],
  });
  process.exit(1);
}

main().catch(async err => {
  console.error('Health check itself failed:', err);
  await sendPipelineAlert({
    job: '系統健康檢查',
    headline: '健康檢查本身執行失敗',
    errors: [String(err)],
  });
  process.exit(1);
});
