# 投資訊號監控 SaaS - Engineering Plan (Smart MVP)

> 最後更新：2026-02-18

## 技術決策總覽

| 項目 | 選擇 | 原因 |
|------|------|------|
| **架構** | 純 Code（不用 n8n）| 省 VPS 費用、邏輯集中、好維護 |
| **STT** | AssemblyAI | 流行、穩定、$0.15/hr、185 小時免費 |
| **AI 分析** | Claude API | 中文理解好、摘要品質高 |
| **資料庫** | Supabase (PostgreSQL) | 免費額度大、Auth 整合好 |
| **前端** | Next.js + shadcn/ui | 可整合 Admin Panel、Vercel 免費 |
| **Cron** | Vercel Cron | 免費、不需額外服務 |
| **付款** | Stripe | 訂閱管理完整 |
| **Email** | Resend | 免費 3k/月、現代 API |
| **Analytics** | PostHog（可選）| 追蹤系統狀態 |

---

## 一、方案設計

### 免費版 vs 付費版

```
免費版 (Free)
├── 全部來源（與付費版相同）
├── 前 3 天：每天收到 Email（體驗期）
├── 第 4 天起：每週只收一封（週一）
└── 目的：嘗到甜頭後想要每天 → 付費

付費版 (NT$ 199/月)
├── 全部來源（與免費版相同）
├── 每天收到 Email
├── 促銷：前兩個月 NT$99/月
└── 取消後保留至帳期結束，可隨時恢復
```

> **設計決策**：免費/付費的唯一差異是 Email 頻率（每週 vs 每日），來源完全相同。
> 這簡化了用戶體驗，避免「選來源」的決策疲勞。

---

## 二、系統架構

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js App (Vercel)                                       │
│                                                             │
│  用戶端                                                     │
│  ├── / - Landing Page（方案介紹 + 註冊/登入 CTA）          │
│  ├── /login - Magic Link 登入                               │
│  ├── /signup - 填 Email 免費試用                            │
│  ├── /thank-you - 註冊成功 + 引導升級                      │
│  ├── /dashboard - 訂閱管理 + 來源展示（純展示）            │
│  ├── /upgrade - Stripe Checkout 付款頁                     │
│  ├── /privacy - 隱私權政策                                  │
│  └── /terms - 服務條款                                      │
│                                                             │
│  API Routes                                                 │
│  ├── /api/auth/send-magic-link - 發送登入連結               │
│  ├── /api/auth/verify - 驗證 Magic Link                     │
│  ├── /api/auth/me - 取得用戶資料 + lazy subscription sync  │
│  ├── /api/auth/logout - 登出                                │
│  ├── /api/signup - 註冊                                     │
│  ├── /api/sources - 取得來源列表                            │
│  ├── /api/create-checkout-session - 建立 Stripe 付款       │
│  ├── /api/cancel-subscription - 取消訂閱（期末生效）       │
│  ├── /api/resume-subscription - 恢復已取消的訂閱           │
│  ├── /api/unsubscribe - Email 退訂（token-based）          │
│  ├── /api/webhooks/stripe - Stripe Webhook                  │
│  ├── /api/cron/process-feeds - 檢查 RSS + 提交轉錄         │
│  ├── /api/cron/check-transcriptions - 檢查轉錄狀態         │
│  ├── /api/cron/generate-digests - 生成摘要（含快取）       │
│  └── /api/cron/send-emails - 每日 Email 發送               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  服務整合                                                   │
│  ├── Supabase - DB + Auth                                   │
│  ├── AssemblyAI - STT                                       │
│  ├── Claude API - AI 分析                                   │
│  ├── Resend - Email 發送                                    │
│  ├── Stripe - 付款                                          │
│  └── PostHog - Analytics (可選)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、資料庫設計 (Supabase)

```sql
-- =============================================
-- 1. 用戶
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  is_paid BOOLEAN DEFAULT false,
  is_unsubscribed BOOLEAN DEFAULT false,
  selected_sources TEXT[],  -- 歷史欄位，目前所有用戶收到全部來源
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_email_sent TIMESTAMPTZ,
  email_verified BOOLEAN DEFAULT false
);

-- =============================================
-- 2. 來源（Admin 管理）
-- =============================================
CREATE TABLE sources (
  id TEXT PRIMARY KEY,  -- 'gooaye', 'sailing-king'
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('podcast', 'youtube')),
  rss_url TEXT,
  youtube_channel_id TEXT,
  image_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. Episodes
-- =============================================
CREATE TABLE episodes (
  id SERIAL PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT UNIQUE NOT NULL,  -- RSS guid 或 YouTube video ID
  title TEXT NOT NULL,
  audio_url TEXT,
  duration_seconds INT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. Transcription Jobs
-- =============================================
CREATE TABLE transcription_jobs (
  id SERIAL PRIMARY KEY,
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE,
  assemblyai_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcript TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- =============================================
-- 5. AI 分析結果
-- =============================================
CREATE TABLE analyses (
  id SERIAL PRIMARY KEY,
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE UNIQUE,
  summary TEXT,
  key_points JSONB,  -- ["重點1", "重點2", ...]
  stocks_mentioned JSONB,  -- [{"ticker": "NVDA", "sentiment": "bullish", "context": "..."}]
  sentiment TEXT CHECK (sentiment IN ('bullish', 'bearish', 'neutral', 'mixed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 6. Email 發送記錄
-- =============================================
CREATE TABLE email_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL,  -- 'welcome', 'daily', 'weekly'
  subject TEXT,
  episodes_included INT[],
  resend_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX idx_episodes_source_published ON episodes(source_id, published_at DESC);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs(status);
CREATE INDEX idx_email_logs_user ON email_logs(user_id, sent_at DESC);
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);

-- =============================================
-- 7. 摘要快取（避免重複生成）
-- =============================================
CREATE TABLE source_combinations (
  id SERIAL PRIMARY KEY,
  combination_key TEXT UNIQUE NOT NULL,
  source_ids TEXT[] NOT NULL,
  user_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_digests (
  id SERIAL PRIMARY KEY,
  source_combination_key TEXT NOT NULL,
  digest_date DATE NOT NULL,
  email_type TEXT NOT NULL,  -- 'daily', 'weekly'
  html_content TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_combination_key, digest_date, email_type)
);

-- =============================================
-- 8. Magic Link tokens
-- =============================================
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 初始資料

```sql
INSERT INTO sources (id, name, type, rss_url) VALUES
  ('gooaye', '股癌', 'podcast', 'https://feeds.soundon.fm/podcasts/...'),
  ('sailing-king', '美股航海王', 'podcast', 'https://...'),
  ('leek-graduate', '韭菜畢業班', 'podcast', 'https://...'),
  ('jenny-finance', '財女珍妮', 'youtube', NULL),
  ('finance-horn', '財經號角', 'podcast', 'https://...'),
  ('us-stock-cafe', '美股咖啡館', 'podcast', 'https://...');
```

---

## 四、API Routes 設計

### 4.1 Cron: 處理 Feeds

```typescript
// /api/cron/process-feeds/route.ts
// 每 30 分鐘執行一次
// vercel.json: { "path": "/api/cron/process-feeds", "schedule": "*/30 * * * *" }

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const parser = new Parser();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function GET(request: Request) {
  // 驗證 cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 1. 取得所有 active sources
  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .eq('is_active', true);

  for (const source of sources || []) {
    if (source.type === 'podcast' && source.rss_url) {
      try {
        const feed = await parser.parseURL(source.rss_url);

        for (const item of feed.items.slice(0, 5)) {
          // 檢查是否已存在
          const { data: existing } = await supabase
            .from('episodes')
            .select('id')
            .eq('external_id', item.guid)
            .single();

          if (!existing) {
            // 新增 episode
            const { data: episode } = await supabase
              .from('episodes')
              .insert({
                source_id: source.id,
                external_id: item.guid,
                title: item.title,
                audio_url: item.enclosure?.url,
                published_at: item.pubDate
              })
              .select()
              .single();

            // 提交 AssemblyAI 轉錄
            if (episode && episode.audio_url) {
              const assemblyResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
                method: 'POST',
                headers: {
                  'Authorization': process.env.ASSEMBLYAI_API_KEY!,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  audio_url: episode.audio_url,
                  language_code: 'zh'
                })
              });

              const { id: assemblyai_id } = await assemblyResponse.json();

              // 建立 transcription job
              await supabase
                .from('transcription_jobs')
                .insert({
                  episode_id: episode.id,
                  assemblyai_id,
                  status: 'processing'
                });
            }
          }
        }
      } catch (error) {
        console.error(`Error processing ${source.name}:`, error);
      }
    }
  }

  return Response.json({ success: true });
}
```

### 4.2 Cron: 檢查 Transcriptions

```typescript
// /api/cron/check-transcriptions/route.ts
// 每 5 分鐘執行一次

export async function GET(request: Request) {
  // 驗證 cron secret
  // ...

  // 取得 processing 的 jobs
  const { data: jobs } = await supabase
    .from('transcription_jobs')
    .select('*')
    .eq('status', 'processing');

  for (const job of jobs || []) {
    const response = await fetch(
      `https://api.assemblyai.com/v2/transcript/${job.assemblyai_id}`,
      { headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! } }
    );

    const result = await response.json();

    if (result.status === 'completed') {
      await supabase
        .from('transcription_jobs')
        .update({
          status: 'completed',
          transcript: result.text,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
    } else if (result.status === 'error') {
      await supabase
        .from('transcription_jobs')
        .update({
          status: 'failed',
          error_message: result.error
        })
        .eq('id', job.id);
    }
  }

  return Response.json({ success: true });
}
```

### 4.3 Cron: AI 分析

```typescript
// /api/cron/analyze/route.ts
// 每 10 分鐘執行一次

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function GET(request: Request) {
  // 找出已完成轉錄但未分析的 episodes
  const { data: jobs } = await supabase
    .from('transcription_jobs')
    .select('*, episodes(*)')
    .eq('status', 'completed')
    .is('episodes.analyses', null);

  for (const job of jobs || []) {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `分析以下投資 Podcast 轉錄文字：

${job.transcript}

請提供 JSON 格式回覆：
{
  "summary": "200-300 字摘要",
  "key_points": ["重點1", "重點2", "重點3"],
  "stocks_mentioned": [
    {"ticker": "NVDA", "name": "NVIDIA", "sentiment": "bullish", "context": "提到的內容"}
  ],
  "sentiment": "bullish/bearish/neutral/mixed"
}`
      }]
    });

    const content = message.content[0];
    if (content.type === 'text') {
      const analysis = JSON.parse(content.text);

      await supabase
        .from('analyses')
        .insert({
          episode_id: job.episode_id,
          summary: analysis.summary,
          key_points: analysis.key_points,
          stocks_mentioned: analysis.stocks_mentioned,
          sentiment: analysis.sentiment
        });
    }
  }

  return Response.json({ success: true });
}
```

### 4.4 Cron: 發送 Emails

```typescript
// /api/cron/send-emails/route.ts
// 每天早上 8:00 執行
// vercel.json: { "path": "/api/cron/send-emails", "schedule": "0 0 * * *" }

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
  const today = new Date();
  const isMonday = today.getDay() === 1;

  // 取得所有用戶
  const { data: users } = await supabase
    .from('users')
    .select('*');

  for (const user of users || []) {
    const daysSinceSignup = Math.floor(
      (today.getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    let shouldSend = false;
    let emailType: 'daily' | 'weekly' = 'daily';

    if (user.is_paid) {
      // 付費用戶：每天發
      shouldSend = true;
    } else if (daysSinceSignup < 3) {
      // 免費用戶前 3 天：每天發
      shouldSend = true;
    } else if (isMonday) {
      // 免費用戶第 4 天起：只有週一發
      shouldSend = true;
      emailType = 'weekly';
    }

    if (shouldSend) {
      // 取得用戶訂閱來源的最新分析
      const { data: analyses } = await supabase
        .from('analyses')
        .select('*, episodes(*, sources(*))')
        .in('episodes.source_id', user.selected_sources || [])
        .gte('created_at', emailType === 'daily'
          ? new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString()
          : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        )
        .order('created_at', { ascending: false });

      if (analyses && analyses.length > 0) {
        // 發送 Email
        const { data: emailResult } = await resend.emails.send({
          from: '投資訊號監控 <digest@yourdomain.com>',
          to: user.email,
          subject: `📊 ${emailType === 'daily' ? '今日' : '本週'}投資訊號摘要`,
          html: generateEmailHtml(analyses, user, emailType)
        });

        // 記錄發送
        await supabase
          .from('email_logs')
          .insert({
            user_id: user.id,
            email_type: emailType,
            subject: `${emailType === 'daily' ? '今日' : '本週'}投資訊號摘要`,
            episodes_included: analyses.map(a => a.episode_id),
            resend_id: emailResult?.id
          });

        // 更新最後發送時間
        await supabase
          .from('users')
          .update({ last_email_sent: new Date().toISOString() })
          .eq('id', user.id);
      }
    }
  }

  return Response.json({ success: true });
}
```

---

## 五、Admin Panel

### 5.1 來源管理

```typescript
// /app/admin/sources/page.tsx

export default async function AdminSourcesPage() {
  const supabase = createServerClient();
  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">來源管理</h1>

      <AddSourceDialog />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名稱</TableHead>
            <TableHead>類型</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources?.map((source) => (
            <TableRow key={source.id}>
              <TableCell>{source.name}</TableCell>
              <TableCell>{source.type}</TableCell>
              <TableCell>
                <Badge variant={source.is_active ? 'default' : 'secondary'}>
                  {source.is_active ? '啟用' : '停用'}
                </Badge>
              </TableCell>
              <TableCell>
                <SourceActions source={source} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### 5.2 其他 Admin 頁面

類似結構：
- `/admin/jobs` - 顯示 transcription_jobs 列表 + 狀態
- `/admin/users` - 顯示用戶列表 + 付費狀態
- `/admin/emails` - 顯示 email_logs 列表

---

## 六、Vercel 設定

### vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/process-feeds",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/check-transcriptions",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/analyze",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/cron/send-emails",
      "schedule": "0 0 * * *"
    }
  ]
}
```

### 環境變數

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# 外部 API
ASSEMBLYAI_API_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
STRIPE_PROMO_COUPON_ID=          # 選填，首月折扣
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Auth
JWT_SECRET=

# Cron
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=
```

---

## 七、成本估算

### 月度成本（6 個來源）

| 項目 | 計算 | 成本 |
|------|------|------|
| AssemblyAI | 48 hrs × $0.15/hr | $7.20 |
| Claude API | ~100k tokens | $0.50 |
| Resend | 免費 3k/月 | $0 |
| Supabase | 免費額度 | $0 |
| Vercel | Hobby（免費）| $0 |
| **Total** | | **~$8/月** |

### 盈虧平衡

```
月度成本：~$8
單一付費用戶收入：NT$199 ≈ $6.5
盈虧平衡：2 個付費用戶
```

---

## 八、開發 Milestones

### Phase 1: 基礎建設 ✅
- [x] Supabase 專案 + Schema
- [x] Next.js 專案 + shadcn/ui
- [x] 環境變數設定

### Phase 2: 資料處理 ✅
- [x] /api/cron/process-feeds
- [x] /api/cron/check-transcriptions
- [x] /api/cron/generate-digests（含摘要快取機制）
- [x] /api/cron/send-emails（含退訂過濾、List-Unsubscribe header）

### Phase 3: 用戶端 ✅
- [x] Landing Page（方案介紹 + pricing）
- [x] Signup 頁面（填 Email 免費試用）
- [x] Thank You 頁面
- [x] Login 頁面（Magic Link）
- [x] Dashboard（訂閱管理 + 來源展示）
- [x] Upgrade 頁面（Stripe Checkout）
- [x] Welcome / Daily / Weekly Email 模板

### Phase 4: 付款與合規 ✅
- [x] Stripe 整合（Checkout Session + Webhook + 取消/恢復訂閱）
- [x] 隱私權政策 + 服務條款頁面
- [x] Email 退訂機制（token-based + List-Unsubscribe）
- [x] Rate limiting（signup + magic link）

### Phase 5: 測試 & 上線
- [x] Stripe test mode 端到端測試
- [ ] 部署到 Vercel
- [ ] DNS 設定 + Stripe production keys
- [ ] Stripe Webhook endpoint 設定（production）

### Phase 6: Admin Panel（待開發）
- [ ] /admin/sources
- [ ] /admin/jobs
- [ ] /admin/users
- [ ] /admin/emails
