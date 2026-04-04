/**
 * One-time script: sync all existing active users to Resend Audience.
 * Backfills resend_contact_id in the users table.
 *
 * Usage: npx tsx scripts/sync-contacts-to-resend.ts
 *
 * Prerequisites:
 *   1. Create an Audience in Resend Dashboard (Audience tab → + Add contacts)
 *   2. Set RESEND_AUDIENCE_ID in your .env file
 */
import 'dotenv/config';
import { Resend } from 'resend';
import { supabaseAdmin } from '../lib/supabase';

const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

async function main() {
  if (!AUDIENCE_ID) {
    console.error('RESEND_AUDIENCE_ID is not set. Please create an Audience in Resend Dashboard and set the env var.');
    process.exit(1);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Fetch all users that don't have a resend_contact_id yet
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, email, is_unsubscribed')
    .is('resend_contact_id', null);

  if (error) {
    console.error('Failed to fetch users:', error.message);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('All users already synced to Resend Audience.');
    return;
  }

  console.log(`Found ${users.length} users to sync to Resend Audience (${AUDIENCE_ID})...`);

  let synced = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const { data, error: createError } = await resend.contacts.create({
        audienceId: AUDIENCE_ID,
        email: user.email,
        unsubscribed: user.is_unsubscribed === true,
      });

      if (createError) {
        console.error(`  Failed: ${user.email} — ${createError.message}`);
        failed++;
        continue;
      }

      if (data?.id) {
        await supabaseAdmin
          .from('users')
          .update({ resend_contact_id: data.id })
          .eq('id', user.id);
      }

      synced++;
      console.log(`  Synced: ${user.email} → ${data?.id}`);
    } catch (err) {
      console.error(`  Error: ${user.email} —`, err);
      failed++;
    }
  }

  console.log(`\nDone! Synced: ${synced}, Failed: ${failed}, Total: ${users.length}`);
}

main().catch(console.error);
