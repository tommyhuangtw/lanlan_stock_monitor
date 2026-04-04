# Resend Email 服務擴展計畫

> 懶懶財經速報 (ailanbao.org) — 每日寄出相同內容的投資摘要 Email 給所有訂閱者

## 當前狀態 (2026-04)

| 項目 | 狀態 |
|------|------|
| Resend 方案 | Free |
| 每月上限 | 3,000 封 |
| 每日上限 | 100 封 |
| Rate Limit | 5 req/s |
| Domain | 1 個 (ailanbao.org) |
| 送達率 | 100% |
| Bounce / Complaint Rate | 0% |

---

## 分階段擴展路線

### 階段 1：0 → 100 訂閱者（Free Plan，$0/月）

**限制**：每日 100 封、每月 3,000 封

**技術優化（已完成）**：
- [x] 改用 Resend Batch API（每次 API call 發送最多 100 封）
- [x] 同步訂閱者到 Resend Audience（方便在 dashboard 管理）
- [x] 新增 `resend_contact_id` 欄位到 users 表

**行動項**：
- 在 Resend Dashboard 建立一個 Audience
- 設定 `RESEND_AUDIENCE_ID` 環境變數
- 執行 `sync-contacts-to-resend.ts` 同步現有用戶

---

### 階段 2：100 → 1,600 訂閱者（Pro Plan，$20/月）

**觸發時機**：訂閱者超過 100 人（超出 Free Plan 每日上限）

**升級方式**：在 Resend Dashboard → Settings → Billing → Upgrade 到 Pro

**Pro Plan 內容**：
- 50,000 封/月（1,600 人 × 30 天 ≈ 48,000 封）
- 無每日上限
- 10 個 Domain
- Overage 費率：$0.90 / 1,000 封

**注意事項**：
- 1,600 訂閱者是 $20/月 的極限，超過會產生 overage 費用
- 建議開啟 Transactional Overages（Settings → Usage → Toggle on）避免發送被中斷

---

### 階段 3：1,600 → 3,000+ 訂閱者（決策點）

**每月郵件量**：3,000 × 30 = 90,000 封

#### 選項 A：繼續使用 Resend Pro + Overage

| 項目 | 費用 |
|------|------|
| Pro 基礎費 | $20/月 |
| Overage（40,000 封 × $0.90/1K） | ~$36/月 |
| **合計** | **~$56/月** |

**優點**：不需要改任何程式碼
**缺點**：相對貴

#### 選項 B：升級 Resend Scale Plan

| 項目 | 費用 |
|------|------|
| Scale 方案 | $90/月 |
| 含 100,000 封/月 | 足夠 3,000 人使用 |

**優點**：有 Slack support、可加 Dedicated IP
**缺點**：更貴，但有餘量

#### 選項 C：遷移到 Amazon SES（最省錢）

| 項目 | 費用 |
|------|------|
| SES 費用（90K 封 × $0.10/1K） | ~$9/月 |

**優點**：大幅降低成本（$9 vs $56）
**缺點**：
- 需要改寫發送邏輯（用 AWS SDK 取代 Resend SDK）
- 需要自行管理 bounce/complaint handling
- 需要 IP warm-up 確保送達率
- 失去 Resend dashboard 的便利功能

#### 選項 D：改用 Resend Broadcast（Marketing Plan）

| 項目 | 費用 |
|------|------|
| Marketing Pro（5,000 contacts） | $40/月 |
| 無限次發送 | 含在方案中 |

**優點**：
- Resend 自動管理退訂頁面
- 內建 Audience 管理和分群功能
- 對「所有人收到相同內容」的場景最適合

**缺點**：
- 超出 $20 預算
- 需要改架構（從 Transactional API 改為 Broadcast API）

### 推薦路線

```
Free ($0) → Pro ($20) → 視收入決定
                         ├── 有收入 → 接受 overage 或升 Scale
                         └── 無收入 → 遷移到 Amazon SES ($9)
```

---

## 成本預估對照表

| 訂閱人數 | 每月封數 | Free | Pro | Scale | SES |
|---------|---------|------|-----|-------|-----|
| 50 | 1,500 | $0 | - | - | - |
| 100 | 3,000 | $0* | $20 | - | - |
| 500 | 15,000 | ❌ | $20 | - | $1.5 |
| 1,000 | 30,000 | ❌ | $20 | - | $3 |
| 1,600 | 48,000 | ❌ | $20 | - | $4.8 |
| 2,000 | 60,000 | ❌ | $29 | $90 | $6 |
| 3,000 | 90,000 | ❌ | $56 | $90 | $9 |
| 5,000 | 150,000 | ❌ | $110 | $90 | $15 |

> *Free Plan 每日上限 100 封，100 訂閱者已是極限
> Pro overage = $0.90/1,000 封（超過 50K 的部分）

---

## 技術架構筆記

### Batch API 效能
- 每次 API call 最多 100 封
- Rate Limit: 5 req/s → 理論上每秒 500 封
- 3,000 人只需 30 次 API call，約 6 秒完成

### Audience 同步機制
- 新用戶註冊 → `resend.contacts.create()`
- 退訂 → `resend.contacts.update({ unsubscribed: true })`
- 重新訂閱 → `resend.contacts.update({ unsubscribed: false })`
- Bounce/Complaint → webhook 自動同步

### 重要限制
- Resend Batch API 不支援 `attachments` 和 `scheduled_at`
- Resend Free Plan Audience 上限 1,000 contacts
- Rate Limit 是 team-wide 共享的（包含 welcome email + daily email）
