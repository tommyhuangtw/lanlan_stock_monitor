# 部署後手動設定清單

> 適用於：Resend Webhook + PostHog email 追蹤功能上線

---

## 1. Resend Dashboard - 啟用 Email 開信/點擊追蹤

1. 登入 [Resend Dashboard](https://resend.com/domains)
2. 選擇你的 domain（ailanbao.org）
3. 找到 **Tracking** 設定區塊
4. 啟用 **Open tracking**（開信追蹤）
5. 啟用 **Click tracking**（點擊追蹤）

> 這是 domain level 的設定，啟用後所有從該 domain 發出的 email 都會自動追蹤。

---

## 2. Resend Dashboard - 新增 Webhook Endpoint

1. 前往 [Resend Webhooks](https://resend.com/webhooks)
2. 點擊 **Add Endpoint**
3. 設定：
   - **URL**: `https://ailanbao.org/api/webhooks/resend`
   - **Events** 勾選以下 5 個：
     - `email.delivered`
     - `email.opened`
     - `email.clicked`
     - `email.bounced`
     - `email.complained`
4. 建立後，複製頁面上顯示的 **Signing Secret**（格式類似 `whsec_...`）

---

## 3. Vercel - 新增環境變數

1. 前往 [Vercel Dashboard](https://vercel.com) → 你的專案 → Settings → Environment Variables
2. 新增：

| Key | Value | Environments |
|-----|-------|-------------|
| `RESEND_WEBHOOK_SECRET` | 上一步複製的 signing secret（`whsec_...`） | Production, Preview |

3. 新增完成後 **Redeploy** 讓環境變數生效

---

## 4. 驗證

### 4a. Webhook 連線測試

1. 回到 Resend Webhooks 頁面
2. 點擊剛建立的 endpoint
3. 使用 **Send test event** 功能，選擇 `email.delivered`
4. 確認回應狀態為 **200 OK**

### 4b. 完整流程測試

1. 用一個測試 email 註冊
2. 確認收到 welcome email
3. 開啟 email
4. 前往 [PostHog Live Events](https://us.posthog.com/events) 確認以下事件出現：
   - `user_signed_up`
   - `email_sent`（email_type: welcome）
   - `email_delivered`
   - `email_opened`

### 4c. 取消訂閱測試

1. 在 dashboard 切換「暫停接收」
2. 確認 PostHog 出現 `user_unsubscribed`（method: dashboard_toggle）
3. 再切換回來，確認出現 `user_resubscribed`

---

## PostHog 事件總覽（供建立 Dashboard 參考）

| 事件 | 觸發來源 | 主要屬性 |
|------|----------|----------|
| `user_signed_up` | 註冊 API | email, source_count |
| `email_sent` | 每日 pipeline + 註冊 welcome | email_type, resend_id, source_count |
| `email_delivered` | Resend webhook | resend_id, email_to, email_subject |
| `email_opened` | Resend webhook | resend_id, email_to |
| `email_clicked` | Resend webhook | resend_id, click_url |
| `email_bounced` | Resend webhook | resend_id, email_to |
| `email_complained` | Resend webhook | resend_id, email_to |
| `user_unsubscribed` | dashboard / email link / webhook bounce | method |
| `user_resubscribed` | dashboard toggle | method |

### 建議的 PostHog 指標

- **開信率** = `email_opened` unique / `email_sent` unique（按日分群）
- **點擊率** = `email_clicked` unique / `email_opened` unique
- **退信率** = `email_bounced` / `email_sent`
- **Email funnel**: sent → delivered → opened → clicked
- **用戶留存**: 每週有 `email_opened` 的 unique users
