/**
 * Tech-stock gate for anything entering the watchlist.
 *
 * The monitor already archives non-tech names, but that happens hours after
 * they're added — long enough for the pipeline to announce them to LINE as
 * "新加入監控" and then quietly drop them. Checking at the point of insert
 * stops that churn: Phillips 66, Home Depot and Marriott never get added,
 * so they're never announced.
 *
 * Fails open. If classification errors the stock goes in and the monitor's
 * cleanup catches it on the next pass — the same fallback used everywhere
 * else, because wrongly rejecting a stock loses coverage silently.
 */
import { fetchSectorProfile } from './stock-data';
import { classifyTechStocks } from './openrouter';
import { log } from './logger';

export interface TechGateResult {
  tech: boolean;
  reason: string;
  sector: string | null;
  industry: string | null;
  /** False when classification failed — don't cache these. */
  ok: boolean;
}

export async function checkTechStock(
  tickerNormalized: string,
  ticker: string,
  name?: string | null,
): Promise<TechGateResult> {
  const profile = await fetchSectorProfile(tickerNormalized);
  const [verdict] = await classifyTechStocks([
    { ticker, name, sector: profile.sector, industry: profile.industry, summary: profile.summary },
  ]);

  if (!verdict?.ok) {
    log('warn', `[TechGate] ${ticker} classification failed, allowing through`);
    return { tech: true, reason: '分類失敗，暫時放行', sector: profile.sector, industry: profile.industry, ok: false };
  }

  return {
    tech: verdict.tech,
    reason: verdict.reason,
    sector: profile.sector,
    industry: profile.industry,
    ok: true,
  };
}

/** Columns to persist alongside a newly inserted stock, so the monitor doesn't re-classify it. */
export function techColumns(r: TechGateResult): Record<string, unknown> {
  if (!r.ok) return {};
  return {
    sector: r.sector,
    industry: r.industry,
    is_tech: r.tech,
    tech_reason: r.reason,
    sector_checked_at: new Date().toISOString(),
  };
}
