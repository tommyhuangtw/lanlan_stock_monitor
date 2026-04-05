# PostHog Dashboard 設定指南

## 可用 Events

| Event | 來源 | 說明 |
|-------|------|------|
| `$pageview` | 前端 autocapture | 頁面瀏覽（含 URL） |
| `$pageleave` | 前端 autocapture | 離開頁面 |
| `$autocapture` | 前端 autocapture | 點擊按鈕等互動（含 element text） |
| `user_signed_up` | `/api/signup` | 用戶完成註冊 |
| `user_resubscribed` | `/api/signup` | 已退訂用戶重新訂閱（property: `method` = signup_form） |
| `email_sent` | signup + daily pipeline | 寄出 email（property: `email_type` = welcome/daily） |
| `email_delivered` | Resend webhook | Email 成功送達 |
| `email_opened` | Resend webhook | 用戶開信 |
| `email_clicked` | Resend webhook | 用戶點擊信中連結（property: `click_url`） |
| `email_bounced` | Resend webhook | Email 退信 |
| `email_complained` | Resend webhook | 用戶檢舉垃圾信 |
| `user_unsubscribed` | `/api/unsubscribe` | 用戶取消訂閱 |

---

## 建議 Dashboard：5 個 Insight

### 1. 網站轉換漏斗（Funnel）
- **Type:** Funnel
- **Steps:**
  1. `$pageview` where `$current_url` contains `/` (Landing page)
  2. `$autocapture` where `$el_text` = `免費訂閱`（點擊訂閱按鈕）
  3. `user_signed_up`（完成註冊）
- **意義:** 看到多少 % 的訪客最後有註冊

### 2. Email 送達漏斗（Funnel）
- **Type:** Funnel
- **Steps:**
  1. `email_sent`
  2. `email_delivered`
  3. `email_opened`
  4. `email_clicked`
- **Filter:** `email_type` = `daily`（排除 welcome email）
- **意義:** 寄出 → 送達 → 開信 → 點擊的轉換率

### 3. 開信率趨勢（Trend）
- **Type:** Trend, 按日
- **Series A:** `email_opened` unique users
- **Series B:** `email_sent` unique users（where `email_type` = `daily`）
- **Formula:** A / B（開信率）
- **意義:** 每天的開信率趨勢

### 4. Buy Me a Coffee 點擊（Trend）
- **Type:** Trend
- **Event:** `email_clicked` where `click_url` contains `buymeacoffee`
- **Breakdown:** by `click_url`
- **意義:** 有多少人點了 BMC 連結

### 5. 用戶增長 & 流失（Trend）
- **Type:** Trend, 按日/按週
- **Series A:** `user_signed_up` total count（新增）
- **Series B:** `user_unsubscribed` total count（流失）
- **意義:** 淨增長 = 新增 - 流失

---

## 在 PostHog 建立步驟

1. 進入 PostHog → Dashboards → New Dashboard → 命名「懶懶財經速報 - 營運監控」
2. 點 + Add insight → 依上面 5 個分別建立
3. 每個 insight 建立後會自動加到 dashboard
4. 可以 pin dashboard 到首頁

## 注意事項
- Resend webhook 的 events（delivered/opened/clicked）需要先完成 webhook 設定才會有數據
- `email_opened` 依賴 tracking pixel，部分 email client 會封鎖（開信率通常偏低是正常的）
- `$autocapture` 的 `$el_text` 要確認按鈕文字完全一致
