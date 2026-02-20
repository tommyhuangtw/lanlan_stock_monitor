/**
 * Digest Cache Utilities
 * Handles caching of email digests by source combination
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { ConsolidatedReport } from './openrouter';

// =============================================
// Types
// =============================================

export interface DailyDigest {
  id: number;
  digest_date: string;
  source_combination_key: string;
  source_ids: string[];
  email_type: 'daily' | 'weekly';
  episode_ids: number[];
  consolidated_report: ConsolidatedReport;
  quick_digest: string[];
  market_mood: string;
  html_template: string;
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'no_content';
  error_message?: string;
  emails_sent: number;
  created_at: string;
  completed_at?: string;
}

export interface SourceCombination {
  combination_key: string;
  source_ids: string[];
  subscriber_count: number;
  last_used_at: string;
  created_at: string;
}

export interface CacheResult {
  found: boolean;
  digest?: DailyDigest;
  reason: 'cache_hit' | 'no_content' | 'generating' | 'not_found' | 'failed';
}

// =============================================
// Combination Key Functions
// =============================================

/**
 * Generate a unique key for a source combination
 *
 * Rules:
 * 1. Sort source IDs alphabetically
 * 2. Join with |
 *
 * Examples:
 * - [gooaye, finance-horn] → "finance-horn|gooaye"
 * - [finance-horn, gooaye] → "finance-horn|gooaye" (same!)
 * - [gooaye] → "gooaye"
 */
export function generateCombinationKey(sourceIds: string[]): string {
  return [...sourceIds]
    .filter(id => id && id.trim())
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

/**
 * Parse source IDs from a combination key
 */
export function parseCombinationKey(key: string): string[] {
  return key.split('|').filter(id => id.trim());
}

/**
 * Check if two source combinations are the same
 */
export function isSameCombination(sources1: string[], sources2: string[]): boolean {
  return generateCombinationKey(sources1) === generateCombinationKey(sources2);
}

// =============================================
// Date Functions
// =============================================

/**
 * Format date in Taipei timezone as YYYY-MM-DD
 */
export function formatDateTaipei(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

/**
 * Get today's date in Taipei timezone
 */
export function getTodayTaipei(): string {
  return formatDateTaipei(new Date());
}

// =============================================
// Cache Operations
// =============================================

/**
 * Get cached digest for a source combination
 */
export async function getCachedDigest(
  supabase: SupabaseClient,
  sourceIds: string[],
  emailType: 'daily' | 'weekly',
  date?: Date
): Promise<CacheResult> {
  const combinationKey = generateCombinationKey(sourceIds);
  const dateStr = date ? formatDateTaipei(date) : getTodayTaipei();

  const { data: digest, error } = await supabase
    .from('daily_digests')
    .select('*')
    .eq('digest_date', dateStr)
    .eq('source_combination_key', combinationKey)
    .eq('email_type', emailType)
    .single();

  if (error || !digest) {
    return { found: false, reason: 'not_found' };
  }

  switch (digest.status) {
    case 'completed':
      return { found: true, digest: digest as DailyDigest, reason: 'cache_hit' };
    case 'no_content':
      return { found: false, reason: 'no_content' };
    case 'generating':
      return { found: false, reason: 'generating' };
    case 'failed':
      return { found: false, reason: 'failed' };
    default:
      return { found: false, reason: 'not_found' };
  }
}

/**
 * Create or update a digest record
 */
export async function createDigestRecord(
  supabase: SupabaseClient,
  sourceIds: string[],
  emailType: 'daily' | 'weekly',
  date?: Date
): Promise<number> {
  const combinationKey = generateCombinationKey(sourceIds);
  const dateStr = date ? formatDateTaipei(date) : getTodayTaipei();

  const { data, error } = await supabase
    .from('daily_digests')
    .upsert({
      digest_date: dateStr,
      source_combination_key: combinationKey,
      source_ids: sourceIds.sort(),
      email_type: emailType,
      status: 'pending',
    }, {
      onConflict: 'digest_date,source_combination_key,email_type',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create digest record: ${error.message}`);
  }

  return data.id;
}

/**
 * Update digest with generated content
 */
export async function saveDigestContent(
  supabase: SupabaseClient,
  digestId: number,
  content: {
    episodeIds: number[];
    consolidatedReport: ConsolidatedReport;
    quickDigest: string[];
    marketMood: string;
    htmlTemplate: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('daily_digests')
    .update({
      episode_ids: content.episodeIds,
      consolidated_report: content.consolidatedReport,
      quick_digest: content.quickDigest,
      market_mood: content.marketMood,
      html_template: content.htmlTemplate,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', digestId);

  if (error) {
    throw new Error(`Failed to save digest content: ${error.message}`);
  }
}

/**
 * Mark digest as failed
 */
export async function markDigestFailed(
  supabase: SupabaseClient,
  digestId: number,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('daily_digests')
    .update({
      status: 'failed',
      error_message: errorMessage,
    })
    .eq('id', digestId);
}

/**
 * Mark digest as no content
 */
export async function markDigestNoContent(
  supabase: SupabaseClient,
  digestId: number
): Promise<void> {
  await supabase
    .from('daily_digests')
    .update({
      status: 'no_content',
      completed_at: new Date().toISOString(),
    })
    .eq('id', digestId);
}

/**
 * Mark digest as generating
 */
export async function markDigestGenerating(
  supabase: SupabaseClient,
  digestId: number
): Promise<void> {
  await supabase
    .from('daily_digests')
    .update({
      status: 'generating',
    })
    .eq('id', digestId);
}

// =============================================
// Latest Digest Lookup
// =============================================

/**
 * Get the most recent completed digest for a source combination
 * Looks back up to maxDaysBack days from today
 */
export async function getLatestCompletedDigest(
  supabase: SupabaseClient,
  sourceIds: string[],
  maxDaysBack: number = 7
): Promise<DailyDigest | null> {
  const combinationKey = generateCombinationKey(sourceIds);
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - maxDaysBack);
  const cutoffStr = formatDateTaipei(cutoff);

  const { data, error } = await supabase
    .from('daily_digests')
    .select('*')
    .eq('source_combination_key', combinationKey)
    .eq('email_type', 'daily')
    .eq('status', 'completed')
    .gte('digest_date', cutoffStr)
    .order('digest_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as DailyDigest;
}

// =============================================
// Source Combination Registry
// =============================================

/**
 * Get all source combinations with subscribers
 */
export async function getActiveCombinations(
  supabase: SupabaseClient
): Promise<SourceCombination[]> {
  const { data, error } = await supabase
    .from('source_combinations')
    .select('*')
    .gt('subscriber_count', 0);

  if (error) {
    throw new Error(`Failed to get active combinations: ${error.message}`);
  }

  return data || [];
}

/**
 * Update source combination registry when user changes subscription
 */
export async function updateCombinationRegistry(
  supabase: SupabaseClient,
  oldSources: string[],
  newSources: string[]
): Promise<void> {
  const oldKey = oldSources.length > 0 ? generateCombinationKey(oldSources) : null;
  const newKey = newSources.length > 0 ? generateCombinationKey(newSources) : null;

  // Same combination, no update needed
  if (oldKey === newKey) return;

  // Decrement old combination count
  if (oldKey) {
    await supabase.rpc('decrement_combination_count', { p_key: oldKey });
  }

  // Increment new combination count
  if (newKey) {
    await supabase.rpc('increment_combination_count', {
      p_key: newKey,
      p_source_ids: newSources.sort(),
    });
  }
}

/**
 * Initialize combination registry from existing users
 * Run this once to populate the registry
 */
export async function initializeCombinationRegistry(
  supabase: SupabaseClient
): Promise<{ combinationsCreated: number }> {
  // Get all users with their selected sources
  const { data: users, error } = await supabase
    .from('users')
    .select('selected_sources');

  if (error) {
    throw new Error(`Failed to get users: ${error.message}`);
  }

  // Count combinations
  const combinationCounts: Record<string, { count: number; sourceIds: string[] }> = {};

  for (const user of users || []) {
    const sources = user.selected_sources || [];
    if (sources.length === 0) continue;

    const key = generateCombinationKey(sources);
    if (!combinationCounts[key]) {
      combinationCounts[key] = { count: 0, sourceIds: sources.sort() };
    }
    combinationCounts[key].count++;
  }

  // Upsert combinations
  for (const [key, { count, sourceIds }] of Object.entries(combinationCounts)) {
    await supabase
      .from('source_combinations')
      .upsert({
        combination_key: key,
        source_ids: sourceIds,
        subscriber_count: count,
        last_used_at: new Date().toISOString(),
      }, {
        onConflict: 'combination_key',
      });
  }

  return { combinationsCreated: Object.keys(combinationCounts).length };
}

// =============================================
// Digest Email Tracking
// =============================================

/**
 * Record email sent to user
 */
export async function recordEmailSent(
  supabase: SupabaseClient,
  digestId: number,
  userId: string,
  magicLinkUrl: string,
  resendId?: string
): Promise<void> {
  await supabase
    .from('digest_emails')
    .upsert({
      daily_digest_id: digestId,
      user_id: userId,
      magic_link_url: magicLinkUrl,
      status: 'sent',
      resend_id: resendId,
      sent_at: new Date().toISOString(),
    }, {
      onConflict: 'daily_digest_id,user_id',
    });

  // Increment emails_sent count
  await supabase.rpc('increment_emails_sent', { p_digest_id: digestId });
}

/**
 * Check if email was already sent to user for this digest
 */
export async function wasEmailSent(
  supabase: SupabaseClient,
  digestId: number,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('digest_emails')
    .select('id')
    .eq('daily_digest_id', digestId)
    .eq('user_id', userId)
    .eq('status', 'sent')
    .single();

  return !!data;
}
