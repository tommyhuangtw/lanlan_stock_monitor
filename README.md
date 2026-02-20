# ailanbao_stock_monitoring

AI-powered investment podcast & YouTube digest service. Automatically monitors Chinese-language investment content, transcribes episodes, analyzes with AI, and delivers daily email digests to subscribers.

## Architecture

```
RSS/YouTube → Transcription → AI Analysis → Digest Generation → Email Delivery
              (AssemblyAI)    (OpenRouter)   (Gemini Pro)         (Resend)
              (Apify)
```

**Stack:** Next.js 16 / Supabase / Vercel Cron / Stripe / PostHog

## Cron Pipeline (UTC)

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Daily 02:00 | `/api/cron/process-feeds` | Fetch latest podcast episodes via RSS |
| Daily 02:00 | `/api/cron/process-youtube` | Fetch latest YouTube videos |
| Every 5 min | `/api/cron/check-transcriptions` | Poll AssemblyAI / Apify for results |
| Every 10 min | `/api/cron/analyze` | AI analysis on completed transcriptions |
| Daily 23:00 | `/api/cron/generate-digests` | Generate consolidated HTML digest |
| Daily 00:00 | `/api/cron/send-emails` | Send personalized emails to subscribers |

## Monitored Sources

**Podcasts:** 股癌, 財經號角, 美股航海王, 韭菜畢業班, 美股投資學

**YouTube:** Nick 美股咖啡館, NaNa说美股, 陽光財經

## Pricing Model

- **Free trial:** 3 days of daily digests, then weekly (Mondays only)
- **Pro (NT$199/mo):** Daily digests, launch promo NT$99/mo for first 2 months

## Setup

1. Copy `.env.example` to `.env` and fill in all values
2. `npm install`
3. Run Supabase migrations in `supabase/migrations/` (in order)
4. `npm run dev`

## Deployment

Deploy to Vercel with environment variables configured. See `vercel.json` for cron schedules. Requires:
- Supabase project with migrations applied
- Stripe webhook pointing to `/api/webhooks/stripe`
- Resend domain with SPF/DKIM/DMARC configured
- PostHog project for analytics
