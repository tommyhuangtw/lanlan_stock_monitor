import { cookies } from 'next/headers';
import { supabaseAdmin, User, Session } from './supabase';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_DURATION_DAYS = 30;
const MAGIC_LINK_DURATION_MINUTES = 15;

// Generate a random token
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create a magic link for a user
export async function createMagicLink(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_DURATION_MINUTES * 60 * 1000);

  await supabaseAdmin
    .from('magic_links')
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
    });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/auth/verify?token=${token}`;
}

// Verify a magic link and create a session
export async function verifyMagicLink(token: string): Promise<{ user: User; sessionToken: string } | null> {
  // Find the magic link
  const { data: magicLink, error } = await supabaseAdmin
    .from('magic_links')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !magicLink) {
    return null;
  }

  // Mark the magic link as used
  await supabaseAdmin
    .from('magic_links')
    .update({ used_at: new Date().toISOString() })
    .eq('id', magicLink.id);

  // Mark user as email verified
  await supabaseAdmin
    .from('users')
    .update({ email_verified: true })
    .eq('id', magicLink.user_id);

  // Get the user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', magicLink.user_id)
    .single();

  if (!user) {
    return null;
  }

  // Create a session
  const sessionToken = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await supabaseAdmin
    .from('sessions')
    .insert({
      user_id: user.id,
      token: sessionToken,
      expires_at: expiresAt.toISOString(),
    });

  return { user, sessionToken };
}

// Get current user from session cookie
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  // Find valid session
  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!session) {
    return null;
  }

  // Get user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .single();

  return user || null;
}

// Set session cookie
export async function setSessionCookie(sessionToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

// Clear session cookie
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Logout - delete session from database and clear cookie
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('token', sessionToken);
  }

  await clearSessionCookie();
}

// Generate a magic link token for email (without full URL)
export function generateMagicLinkToken(): string {
  return generateToken();
}
