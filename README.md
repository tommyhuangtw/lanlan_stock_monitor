# 懶懶財經速報 (AI Lanren Bao)

AI-powered investment podcast & YouTube digest service. Automatically monitors Chinese-language investment content, transcribes episodes, analyzes with AI, and delivers free daily email digests to subscribers.

## Architecture

```
RSS/YouTube → Transcription → AI Analysis → Digest Generation → Email Delivery
              (AssemblyAI)    (OpenRouter)   (OpenRouter)         (Resend)
              (Apify)
```

**Stack:** Next.js 16 / Supabase / GitHub Actions / PostHog

**AI Models (via OpenRouter):**
- `google/gemini-3.1-pro-preview` — episode analysis & digest generation
- `perplexity/sonar-pro-search` — real-time market brief

## Daily Pipeline

Triggered by GitHub Actions at **01:30 UTC (09:30 Taiwan time)** daily, or manually via `npm run pipeline`.

Pipeline steps (sequential):
1. **Fetch feeds** — RSS podcast episodes & YouTube videos
2. **Transcribe** — AssemblyAI (podcasts) / Apify (YouTube)
3. **Analyze** — AI analysis on completed transcriptions
4. **Generate digest** — Consolidated HTML email with market brief
5. **Send emails** — Personalized emails via Resend batch API

## Monitored Sources

Sources are managed dynamically in the Supabase `sources` table.

**Podcasts:** Gooaye 股癌, 財經皓角翔起, 美股航海王, 韭菜畢業班, 美股投資學 財女珍妮

**YouTube:** Nick 美股咖啡館, NaNa说美股, 陽光財經

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/signup` | POST | New subscriber registration |
| `/api/unsubscribe` | GET | HMAC-based one-click unsubscribe |
| `/api/sources` | GET | List active sources |
| `/api/preview-email` | GET | Preview latest email template |
| `/api/webhooks/resend` | POST | Resend email event webhooks |
| `/api/cron/*` | GET | Pipeline step endpoints |

## Key Features

- **Free daily email digests** with KOL opinion summaries, risk alerts, catalysts, and episode highlights
- **Market brief** powered by Perplexity real-time search
- **HMAC-based unsubscribe** with `List-Unsubscribe` header support
- **Buy Me a Coffee** integration (conditional display on Tue/Fri, 7+ days after signup)
- **PostHog analytics** for signup/email/unsubscribe event tracking
- **Ad slot infrastructure** ready for future monetization

## Setup

1. Copy `.env.example` to `.env` and fill in all values
2. `npm install`
3. Run Supabase migrations in `supabase/migrations/` (in order)
4. `npm run dev`

## Scripts

```bash
npm run dev              # Local development server
npm run pipeline         # Run full daily pipeline
npm run pipeline:test    # Test pipeline (dry run)
```

## Deployment

Deploy to Vercel with environment variables configured. Daily pipeline runs via GitHub Actions (`.github/workflows/daily-pipeline.yml`).

Required services:
- Supabase project with migrations applied
- Resend domain with SPF/DKIM/DMARC configured
- PostHog project for analytics
- AssemblyAI, Apify, OpenRouter API keys
