# 投資訊號監控 SaaS 服務規劃 (Smart MVP)

> 最後更新：2026-02-18
>
> 詳細技術實現請參考：[ENGINEERING_PLAN.md](./ENGINEERING_PLAN.md)

---

## 一、Smart MVP 設計

### 核心簡化

| 原本規劃 | Smart MVP | 目前實作 |
|---------|-----------|---------|
| 3 個方案（免費/基本/專業）| 2 個方案（免費/付費）| ✅ 2 個方案 |
| 用戶選通知頻率 | 固定頻率（系統控制）| ✅ 固定頻率 |
| 用戶選來源 | 保留 | ❌ **移除**（全部來源統一） |
| n8n 自動化 | 純 Code（省 VPS）| ✅ 純 Code |
| 完整 Dashboard | 簡易管理頁 | ✅ 精簡 Dashboard |

### 方案結構

```
免費版 (Free)
├── 全部來源（與付費版相同）
├── 前 3 天：每天收到 Email（體驗付費版感覺）
├── 第 4 天起：每週只收一封（週一）
└── 轉換策略：嘗到每天收的甜頭 → 想要繼續 → 付費

付費版 (NT$ 199/月)
├── 全部來源（與免費版相同）
├── 每天收到 Email
├── 促銷：前兩個月 NT$99/月（Stripe Coupon）
└── 取消後保留至帳期結束，可隨時恢復訂閱
```

### 為什麼這樣設計？

1. **前 3 天每天收** = 讓用戶習慣「每天早上看摘要」的節奏
2. **第 4 天變週報** = 製造「啊，我想要每天收」的需求
3. **只有 2 個選項** = 減少決策疲勞，提高轉換
4. **來源不分免費/付費** = 簡化用戶體驗，唯一差異是頻率

---

## 二、技術架構

### Tech Stack

| 層級 | 工具 | 成本 |
|------|------|------|
| **架構** | 純 Code（不用 n8n）| 省 $6/月 VPS |
| **STT** | AssemblyAI | $0.15/hr |
| **AI 分析** | Claude API | ~$0.003/1k tokens |
| **前端** | Next.js + shadcn/ui | 免費 (Vercel) |
| **Cron** | Vercel Cron | 免費 |
| **認證** | Supabase Auth | 免費 |
| **資料庫** | Supabase (PostgreSQL) | 免費額度 |
| **Email** | Resend | 免費 3k/月 |
| **付款** | Stripe | 2.9% + $0.30 |

### 系統架構圖

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js App (Vercel)                                       │
│                                                             │
│  用戶端                                                     │
│  ├── / - Landing Page（方案介紹 + CTA）                    │
│  ├── /login - Magic Link 登入                               │
│  ├── /signup - 填 Email 免費試用                            │
│  ├── /thank-you - 註冊成功 + 引導升級                      │
│  ├── /dashboard - 訂閱管理 + 來源展示                      │
│  ├── /upgrade - Stripe Checkout 付款                       │
│  ├── /privacy - 隱私權政策                                  │
│  └── /terms - 服務條款                                      │
│                                                             │
│  API Routes                                                 │
│  ├── /api/auth/* - Magic Link 認證                          │
│  ├── /api/create-checkout-session - Stripe 付款             │
│  ├── /api/cancel-subscription - 取消訂閱                   │
│  ├── /api/resume-subscription - 恢復訂閱                   │
│  ├── /api/unsubscribe - Email 退訂                         │
│  ├── /api/webhooks/stripe - Stripe Webhook                  │
│  ├── /api/cron/process-feeds (每 30 分鐘)                  │
│  ├── /api/cron/check-transcriptions (每 5 分鐘)            │
│  ├── /api/cron/generate-digests (每天 7:30)                │
│  └── /api/cron/send-emails (每天 8:00)                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  服務整合                                                   │
│  ├── Supabase - DB + Auth                                   │
│  ├── AssemblyAI - STT ($0.15/hr)                           │
│  ├── Claude API - AI 分析                                   │
│  ├── Resend - Email 發送                                    │
│  └── Stripe - 付款                                          │
└─────────────────────────────────────────────────────────────┘
```

### 為什麼不用 n8n？

| n8n 的問題 | 純 Code 的優勢 |
|-----------|---------------|
| 需要 $6/月 VPS | Vercel 免費 |
| 用戶邏輯難處理（前 3 天 vs 之後）| Code 寫 if-else 很清楚 |
| 多一個服務要維護 | 全部在一個 codebase |
| Workflow 難版本控制 | 全部在 git |

---

## 三、追蹤來源（5 個）

> 所有用戶收到全部來源的摘要，不區分免費/付費。

| # | 來源 | 類型 | 說明 |
|---|------|------|------|
| 1 | 美股投資學 | Podcast | 美股投資教學 |
| 2 | 美股航海王 | Podcast | 美股投資分析 |
| 3 | 股癌 | Podcast | 台灣最受歡迎的投資 Podcast |
| 4 | 財經號角 | Podcast | 財經新聞分析 |
| 5 | 韭菜畢業班 | Podcast | 投資理財教育 |

---

## 四、用戶流程

### 註冊流程
```
1. 用戶進入 Landing Page
2. 點「開始免費試用」→ 填 Email
3. 收到 Welcome Email
4. 進入 Thank You 頁面，引導升級
5. 隔天開始收到每日 Email（全部來源）
6. 第 4 天起，改成每週一封（週一）
7. Email 內有「升級付費版，繼續每天收到」的 CTA
```

### 登入流程
```
1. 用戶在 /login 輸入 Email
2. 收到 Magic Link Email（15 分鐘內有效）
3. 點擊連結 → 自動登入 → 導向 /dashboard
```

### 升級流程
```
1. Dashboard 點「升級專業版」或訪問 /upgrade
2. 點「前往付款」→ 導向 Stripe Checkout
3. 完成付款 → Stripe Webhook 更新 DB
4. 回到 Dashboard 顯示「升級成功」
```

### 取消/恢復流程
```
1. Dashboard 點「取消訂閱」→ 確認 dialog
2. 設為 cancel_at_period_end（保留至帳期結束）
3. Dashboard 顯示「已排定取消」+「恢復訂閱」按鈕
4. 點「恢復訂閱」→ 取消排定，繼續正常訂閱
```

---

## 五、Email 設計

### Email 模板

所有 Email 使用統一的深色主題 HTML 模板，包含：
- Header：日期 + 分析來源數
- 各來源區塊：摘要、重點、提到的股票（含情緒標示）
- Footer：升級 CTA（免費版）/ 退訂連結 / 免責聲明
- Magic Link 登入按鈕

### Email 類型
- **Welcome Email**：註冊時立即發送，含前一天的摘要預覽
- **Daily Email**：付費用戶 + 免費試用期（前 3 天），每天 8:00 發送
- **Weekly Email**：免費用戶（試用期後），每週一 8:00 發送

### 合規
- 每封 Email 包含 `List-Unsubscribe` header
- Footer 包含 token-based 退訂連結
- 退訂後 `is_unsubscribed = true`，不再收到任何 Email

---

## 六、Admin Panel

### /admin/sources - 來源管理
- 列表：所有來源（名稱、類型、狀態、最後更新）
- 新增：填 RSS URL / YouTube Channel ID
- 編輯：修改名稱、URL
- 停用/啟用

### /admin/jobs - Transcription 狀態
- 列表：最近的 transcription jobs
- 狀態：pending / processing / completed / failed
- 重試：對 failed 的 job 重新提交
- 統計：成功率、平均處理時間

### /admin/users - 用戶統計
- 列表：所有用戶（email、方案、註冊日期）
- 統計：總用戶數、付費用戶數、轉換率
- 搜尋：用 email 找用戶

### /admin/emails - Email 記錄
- 列表：最近發送的 emails
- 統計：今日/本週發送量
- 詳情：單封 email 的內容預覽

---

## 七、成本估算

### 月度 API 成本（6 個來源）

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
月度成本：~$8 (~NT$250)
單一付費用戶收入：NT$199 ≈ $6.5
盈虧平衡：2 個付費用戶
```

---

## 八、開發進度

### Phase 1: 基礎建設 ✅
- [x] Supabase 專案 + Schema
- [x] Next.js 專案 + shadcn/ui
- [x] 環境變數設定

### Phase 2: 資料處理 ✅
- [x] RSS Feed 處理 + AssemblyAI 轉錄
- [x] AI 分析（Claude API）
- [x] 摘要快取機制（source_combinations + daily_digests）
- [x] Email 發送（Resend + 退訂過濾 + List-Unsubscribe）

### Phase 3: 用戶端 ✅
- [x] Landing Page + Pricing
- [x] Signup / Login（Magic Link）/ Thank You
- [x] Dashboard（精簡版：訂閱狀態列 + 來源純展示）
- [x] Upgrade 頁面（Stripe Checkout）
- [x] Email 模板（Welcome / Daily / Weekly）

### Phase 4: 付款與合規 ✅
- [x] Stripe 整合（Checkout + Webhook + 取消 + 恢復）
- [x] 隱私權政策 + 服務條款
- [x] Email 退訂機制
- [x] Rate limiting（auth endpoints）

### Phase 5: 部署上線（進行中）
- [x] Stripe test mode 測試通過
- [ ] Vercel 部署
- [ ] DNS + Production Stripe keys
- [ ] Stripe Webhook endpoint（production）

### Phase 6: Admin Panel（待開發）
- [ ] 來源管理 / 轉錄狀態 / 用戶統計 / Email 記錄

---

## 九、確認的決策

| 決策項目 | 選擇 |
|---------|------|
| 架構 | 純 Code（不用 n8n）|
| 免費版 | 全部來源 + 前 3 天每天、之後每週一 |
| 付費版 | 全部來源 + 每天，NT$199/月（前兩個月 NT$99/月）|
| 來源選擇 | 移除（所有用戶收到全部來源，Dashboard 純展示）|
| 認證方式 | Magic Link（無密碼）|
| STT 服務 | AssemblyAI ($0.15/hr) |
| 前端框架 | Next.js + shadcn/ui + Tailwind |
| Cron | Vercel Cron |
| Email | Resend + List-Unsubscribe |
| 付款平台 | Stripe（Checkout + cancel_at_period_end + 恢復訂閱）|
| Rate Limit | In-memory（signup + magic link，5 req / 15 min per IP）|
| Admin Panel | 待開發 |

**追蹤來源（5 個）：**
1. 美股投資學
2. 美股航海王
3. 股癌
4. 財經號角
5. 韭菜畢業班

---

## 十、Email 服務選擇（研究結果）

### 為什麼不用 Gmail？
- Free Gmail：每天只能發 100 封 (SMTP)
- Google Workspace：每天 2000 封
- 容易被標記 spam、帳號可能被停權

### 推薦：Resend

| 服務 | 免費額度 | 8K emails/月 | 特點 |
|------|---------|-------------|------|
| **Resend** | 3,000/月 | $20 | 最佳 DX、現代 API |
| Postmark | 100/月 | $15 | 最佳 deliverability |
| Amazon SES | 3,000/月 | $0.80 | 最便宜但複雜 |

建議：
- **0-500 用戶**：用 Resend（免費 3k，付費 $20/月 = 50k emails）
- **500+ 用戶且預算緊**：考慮 Amazon SES
