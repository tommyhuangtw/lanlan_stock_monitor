/**
 * Send a test email using the latest completed digest.
 * Re-generates HTML from consolidated_report so code changes are reflected.
 * Usage: npx tsx -r dotenv/config scripts/send-test-email.ts <email>
 */
import { supabaseAdmin } from '../lib/supabase';
import { generateHtmlTemplateWithoutMagicLink, injectMagicLinkToHtml } from '../lib/email-generator';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx -r dotenv/config scripts/send-test-email.ts <email>');
    process.exit(1);
  }

  // Get latest completed digest with full data
  const { data: digest, error } = await supabaseAdmin
    .from('daily_digests')
    .select('id, digest_date, consolidated_report, quick_digest, market_mood, market_brief')
    .eq('status', 'completed')
    .order('digest_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !digest) {
    console.error('No completed digest found:', error?.message);
    process.exit(1);
  }

  console.log(`Using digest #${digest.id} from ${digest.digest_date}`);
  console.log(`  market_brief length: ${(digest.market_brief || '').length}`);

  // Re-generate HTML from consolidated_report (reflects latest code changes)
  const htmlTemplate = generateHtmlTemplateWithoutMagicLink(
    digest.consolidated_report,
    digest.quick_digest,
    digest.market_mood,
    digest.market_brief ? { content: digest.market_brief, citations: [] } : undefined
  );

  // Inject placeholder links
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dummyMagicLink = `${baseUrl}/dashboard`;
  const dummyUnsubscribe = `${baseUrl}/api/unsubscribe?token=test`;
  const emailHtml = injectMagicLinkToHtml(htmlTemplate, dummyMagicLink, dummyUnsubscribe);

  // Send
  const { data: result, error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to: email,
    subject: `[TEST] 懶懶財經速報 - ${digest.digest_date}`,
    html: emailHtml,
  });

  if (sendError) {
    console.error('Failed to send:', sendError.message);
    process.exit(1);
  }

  console.log(`Email sent to ${email}! Resend ID: ${result?.id}`);
}

main().catch(console.error);
