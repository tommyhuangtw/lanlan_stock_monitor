import { createClient } from '@supabase/supabase-js';

// Types for database tables
export interface User {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_paid: boolean;
  is_unsubscribed: boolean;
  selected_sources: string[];
  created_at: string;
  last_email_sent: string | null;
  email_verified: boolean;
}

export interface MagicLink {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Source {
  id: string;
  name: string;
  type: 'podcast' | 'youtube';
  rss_url: string | null;
  youtube_channel_id: string | null;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Episode {
  id: number;
  source_id: string;
  external_id: string;
  title: string;
  audio_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  created_at: string;
}

export interface TranscriptionJob {
  id: number;
  episode_id: number;
  assemblyai_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcript: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Analysis {
  id: number;
  episode_id: number;
  summary: string | null;
  key_points: string[];
  stocks_mentioned: {
    ticker: string;
    name?: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    context: string;
  }[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' | null;
  created_at: string;
}

export interface EmailLog {
  id: number;
  user_id: string;
  email_type: 'welcome' | 'daily' | 'weekly';
  subject: string | null;
  episodes_included: number[];
  resend_id: string | null;
  sent_at: string;
}

// Client for browser (uses anon key)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!
);

// Admin client for server-side operations (uses service role key)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
