/**
 * Resend Audience / Contact sync utilities
 * Syncs user lifecycle events to Resend Audience for dashboard management
 */

import { Resend } from 'resend';
import { supabaseAdmin } from './supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

function getAudienceId(): string | null {
  return process.env.RESEND_AUDIENCE_ID || null;
}

/**
 * Create a contact in Resend Audience on user signup.
 * Stores resend_contact_id back to the users table.
 * Non-blocking: failures are logged but don't throw.
 */
export async function syncContactOnSignup(userId: string, email: string): Promise<void> {
  const audienceId = getAudienceId();
  if (!audienceId) return;

  try {
    const { data, error } = await resend.contacts.create({
      audienceId,
      email,
      unsubscribed: false,
    });

    if (error) {
      console.error(`Resend contact create failed for ${email}:`, error.message);
      return;
    }

    if (data?.id) {
      await supabaseAdmin
        .from('users')
        .update({ resend_contact_id: data.id })
        .eq('id', userId);
    }
  } catch (err) {
    console.error(`Resend contact sync error for ${email}:`, err);
  }
}

/**
 * Update contact unsubscribed status in Resend Audience.
 * Used on unsubscribe, resubscribe, and webhook bounce/complaint.
 */
export async function syncContactUnsubscribeStatus(
  userId: string,
  unsubscribed: boolean
): Promise<void> {
  const audienceId = getAudienceId();
  if (!audienceId) return;

  try {
    // Look up the resend_contact_id
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('resend_contact_id, email')
      .eq('id', userId)
      .single();

    if (!user) return;

    if (user.resend_contact_id) {
      // Update existing contact
      await resend.contacts.update({
        audienceId,
        id: user.resend_contact_id,
        unsubscribed,
      });
    } else {
      // Contact not yet synced — create it with the correct status
      const { data, error } = await resend.contacts.create({
        audienceId,
        email: user.email,
        unsubscribed,
      });

      if (!error && data?.id) {
        await supabaseAdmin
          .from('users')
          .update({ resend_contact_id: data.id })
          .eq('id', userId);
      }
    }
  } catch (err) {
    console.error(`Resend contact unsubscribe sync error for userId ${userId}:`, err);
  }
}
