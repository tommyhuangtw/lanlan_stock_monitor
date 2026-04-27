# Stock Monitoring & Entry-Point Notification System

## Context

懶懶財經速報目前的 pipeline 已經每天從 KOL（podcast/YouTube）內容中提取出看多/看空的股票訊號（`Signal` interface in `lib/openrouter.ts:120-129`），但這些資料用完即丟——只出現在當天的電子報中。

Tommy 希望延伸這個能力：**自動追蹤 KOL 看好的股票，監控價格走勢，在盤整、估值偏低、或大跌時主動推送通知**。主要看中長線（1-2 個月以上），不做短線交易。初期自己用，之後分享給家人朋友，最終放上社群。

此外，KOL 經常提到的是**產業主題**而非個股（例如「光通股看好」、「CPU 類股受惠」）。系統需要能自動展開這些主題，搜尋出具體的受惠個股並加入監控。

---

## Phase 1: MVP

### 1. Database Schema (Migration 008)

新增 4 張表，檔案：`supabase/migrations/008_add_stock_monitoring.sql`

#### `watchlist_stocks` — 監控清單主表
```sql
CREATE TABLE watchlist_stocks (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,                -- "AAPL" 或 "台積電 (2330)"
  ticker_normalized TEXT NOT NULL UNIQUE, -- "AAPL" 或 "2330.TW"
  market TEXT NOT NULL CHECK (market IN ('US', 'TW')),
  name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),

  -- KOL 訊號彙整
  first_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
  last_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
  mention_count INT DEFAULT 1,
  kol_sources JSONB DEFAULT '[]',     -- [{kol, reason, date, confidence, episodeId}]
  consensus TEXT,                      -- "多方共識" / "單一來源" / "觀點分歧"

  -- 價格追蹤
  price_at_first_mention DECIMAL(12,4),
  current_price DECIMAL(12,4),
  last_price_update TIMESTAMPTZ,

  -- KOL 提到的價位參考
  kol_price_levels JSONB DEFAULT '[]', -- [{level, type: "support"/"target", kol, date}]

  added_by TEXT DEFAULT 'pipeline',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `stock_prices` — 每日收盤價歷史
```sql
CREATE TABLE stock_prices (
  id SERIAL PRIMARY KEY,
  ticker_normalized TEXT NOT NULL,
  price_date DATE NOT NULL,
  open_price DECIMAL(12,4),
  high_price DECIMAL(12,4),
  low_price DECIMAL(12,4),
  close_price DECIMAL(12,4) NOT NULL,
  volume BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker_normalized, price_date)
);
```

#### `stock_alerts` — 通知紀錄
```sql
CREATE TABLE stock_alerts (
  id SERIAL PRIMARY KEY,
  watchlist_stock_id INT REFERENCES watchlist_stocks(id),
  ticker TEXT NOT NULL,
  market TEXT NOT NULL,
  alert_type TEXT NOT NULL,  -- 'significant_drop_5pct', 'significant_drop_10pct', 'rsi_oversold', 'consolidation', 'near_kol_support', 'ai_entry_signal'
  trigger_price DECIMAL(12,4) NOT NULL,
  trigger_reason TEXT NOT NULL,
  technical_snapshot JSONB DEFAULT '{}',
  kol_context JSONB DEFAULT '[]',
  ai_analysis TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed')),
  sent_via TEXT[] DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `notification_config` — 通知設定
```sql
CREATE TABLE notification_config (
  id SERIAL PRIMARY KEY,
  user_identifier TEXT UNIQUE DEFAULT 'tommy',
  line_channel_token TEXT,
  line_user_id TEXT,
  email TEXT,
  enabled_alert_types TEXT[] DEFAULT ARRAY[
    'significant_drop_5pct', 'significant_drop_10pct',
    'rsi_oversold', 'consolidation', 'near_kol_support'
  ],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2. Watchlist 自動填充（接入現有 Pipeline）

**新檔案**: `lib/pipeline/populate-watchlist.ts`

從 `ConsolidatedReport.bullishSignals` 中提取股票，upsert 到 `watchlist_stocks`：
- 新股票：插入並記錄首次提及價格、KOL 來源、理由
- 已存在：更新 `last_mentioned_at`、`mention_count++`、追加 KOL 來源
- 如果同一股票同時出現在 `bearishSignals`，標記 consensus 為 "觀點分歧"
- 解析 `priceLevel` 欄位，存入 `kol_price_levels`

**修改**: `lib/pipeline/runner.ts` — 在 Step 4 (analyzeAll) 和 Step 5 (generateDigest) 之間插入新的 Step 4.5 和 Step 4.6

**Ticker 標準化邏輯**（`lib/ticker-utils.ts`）:
- `台積電 (2330)` → `2330.TW`（market: TW）
- `AAPL` → `AAPL`（market: US）
- 複用現有 `openrouter.ts:524-536` 的 `isAllowedTicker()` 邏輯

---

### 3. 產業主題自動展開（Sector Expansion）

**新檔案**: `lib/pipeline/expand-sectors.ts`

> 核心需求：KOL 說「光通股看好」，系統自動找出光通訊相關個股（例如 聯亞 (3081)、華星光 (4979)、COHR、LITE）加入 watchlist。

#### 運作流程

**Step 4.6** — 在 populate-watchlist (Step 4.5) 之後執行：

```
1. 從今天的 AnalysisResult 中偵測「產業/主題提及」
   - 修改 analyzeTranscript prompt，新增 sectorThemes 欄位
   - 格式：[{theme: "光通訊", sentiment: "bullish", kol: "股癌", reason: "..."}]

2. 對每個新偵測到的 theme，用 Perplexity 搜尋相關個股
   - Query: "台股光通訊概念股有哪些 2026" 或 "US optical communication stocks list"
   - 複用現有 lib/stock-research.ts 的 Perplexity 整合

3. 用 Gemini 過濾和排序搜尋結果
   - Prompt: "從以下搜尋結果中，找出最直接受惠的 5-8 檔個股，
     排除市值過小或流動性不足的。回傳 ticker + 公司名 + 受惠原因"
   - 只保留台股和美股（複用 isAllowedTicker 邏輯）

4. 將結果 upsert 到 watchlist_stocks
   - added_by = 'sector_expansion'
   - 記錄來源主題和 KOL context
```

#### Database Schema 調整

在 `watchlist_stocks` 表新增：
```sql
  sector_theme TEXT,                   -- "光通訊", "CPU", "AI 伺服器" 等
  sector_expansion_source JSONB,       -- {theme, kol, date, searchQuery, searchResults}
```

#### 防重複搜尋

- 維護一個 `sector_expansions` 表追蹤已展開過的主題：

```sql
CREATE TABLE sector_expansions (
  id SERIAL PRIMARY KEY,
  theme TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'TW', 'both')),
  kol_source TEXT,
  search_query TEXT,
  stocks_found JSONB DEFAULT '[]',     -- [{ticker, name, reason}]
  expanded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme, market)
);
```

- 同一個主題 7 天內不重複搜尋（除非有新的 KOL 也提到）
- 如果多位 KOL 提到同主題，更新 kol_sources 但不重複搜尋

#### AnalysisResult 介面擴充

在 `lib/openrouter.ts` 的 `AnalysisResult` interface 新增：

```typescript
sectorThemes?: {
  theme: string;        // "光通訊", "CPU", "AI 伺服器"
  sentiment: 'bullish' | 'bearish' | 'neutral';
  reason: string;
  specificStocks?: string[];  // KOL 有提到的具體個股
}[];
```

#### AI Prompt 修改

在 `analyzeTranscript()` 的 system prompt 中加入：

```
另外，如果 KOL 提到某個產業或主題的展望（例如「光通股看好」、「CPU 類股受惠」、
「AI 伺服器需求增加」），請在 sectorThemes 欄位中列出：
- theme: 產業/主題名稱
- sentiment: 看好/看空/中性
- reason: KOL 的理由
- specificStocks: KOL 有明確提到的個股（如果有的話）
```

#### 成本評估

- Perplexity 搜尋：每個主題 1 次搜尋，~$0.005/次
- Gemini 過濾：每個主題 1 次呼叫，~$0.01/次
- 預估每天 0-3 個新主題，月成本 < $1

---

### 4. 股價資料抓取

**新檔案**: `lib/stock-data.ts`

**資料來源**: `yahoo-finance2` npm package
- 免費、不需 API key
- US stocks: 直接用 ticker (e.g. `AAPL`)
- TW stocks: 加 `.TW` 後綴 (e.g. `2330.TW`)
- 支援歷史資料與即時報價

**功能**:
- `fetchLatestQuote(tickerNormalized)` — 最新報價
- `fetchHistoricalPrices(tickerNormalized, days)` — 歷史日線資料
- `backfillPrices(tickerNormalized, days=60)` — 新加入股票時回補 60 天歷史資料

**新安裝 dependency**: `yahoo-finance2`

---

### 5. 入場時機判斷（深度分析）

**新檔案**: `lib/entry-point-detector.ts`

> Tommy 的使用情境：看中長線（1-2 個月+），不做短線。主要想知道 KOL 看好的股票是否到了「值得開始佈局」的位置。

#### 規則一：大幅回檔警報

| 條件 | 說明 |
|------|------|
| 從 20 日高點下跌 ≥ 5% | 短期修正，可能是加碼機會 |
| 從 20 日高點下跌 ≥ 10% | 明顯修正，中長線投資者的常見佈局點 |
| 從 52 週高點下跌 ≥ 20% | 技術性熊市，需搭配其他指標確認 |

**計算方式**: 用 `stock_prices` 中的歷史資料計算 20-day high 和 52-week high，與 current price 比較。

#### 規則二：RSI 超賣

| 條件 | 說明 |
|------|------|
| RSI(14) < 30 | 經典超賣區間，短期反彈機率高 |
| RSI(14) < 30 **且** 週線 RSI < 40 | 更強的中長線訊號，代表週級別也偏弱 |

**適合中長線的原因**: RSI 超賣在有基本面支撐（KOL 看好）的股票上，歷史統計上未來 1-3 個月反彈機率較高。

#### 規則三：盤整偵測（Consolidation）

判定股票正在盤整，可能即將突破：

| 指標 | 條件 | 說明 |
|------|------|------|
| Bollinger Band Width | 低於 20 日 BB Width 均值的 50% | Squeeze — 波動收斂，通常預示大行情 |
| 20 日價格振幅 | (20d high - 20d low) / 20d low < 8% | 窄幅震盪 |
| 持續天數 | 盤整持續 ≥ 10 個交易日 | 避免誤判短期波動 |

**通知時機**: 偵測到盤整 + KOL 看多 = 推送「此股正在盤整，KOL 觀點偏多，可留意突破方向」

#### 規則四：觸及 KOL 提到的支撐價位

| 條件 | 說明 |
|------|------|
| 現價距 KOL 提到的支撐位 ≤ 3% | 接近 KOL 認為的低檔區 |

**資料來源**: KOL 分析中的 `priceLevel` 欄位（已存在於 `Signal` interface）

#### 規則五：均線支撐（中長線適用）

| 條件 | 說明 |
|------|------|
| 股價觸及 SMA(200) 且反彈 | 長線多頭趨勢中的經典買點 |
| 股價在 SMA(50) 上方，回測 SMA(50) | 中線上升趨勢中的拉回買點 |

#### 技術指標計算

**新安裝 dependency**: `technicalindicators` npm package（MIT, pure JS）

在 `lib/technical-indicators.ts` 中封裝：
- RSI(14)
- SMA(20, 50, 200)
- Bollinger Bands (20, 2σ)
- Bollinger Band Width
- ATR(14) for volatility reference

每次抓價格後即計算並存入 `stock_prices` 的相關欄位（或獨立計算，不持久化——MVP 先每次即時算）。

#### 防重複通知

同一股票 + 同一 alert_type，72 小時內不重複發送。避免盤整期間每天都推送同樣的通知。

---

### 6. 監控頻率（深度分析）

> 核心考量：中長線投資者，需要捕捉「大幅波動後」的機會，不需要盯盤。

#### 建議排程：每天 3 次

| 時間 (UTC) | 台灣時間 | 抓取內容 | 原因 |
|------------|---------|---------|------|
| 05:35 | 13:35 | 台股收盤價 | 台股 13:30 收盤，5 分鐘後資料穩定 |
| 21:05 | 隔日 05:05 | 美股收盤價 | 美東 16:00 收盤（EDT），5 分鐘後抓取 |
| 14:00 | 22:00 | 美股盤中價 | 美東 10:00 開盤後 30 分鐘，捕捉隔夜重大事件造成的開盤大跌 |

**為什麼加美股盤中那次？**
- 美股重大利空（財報、Fed 決策、地緣政治）通常反映在開盤價
- 如果某 KOL 看好的股票開盤暴跌 5%+，你會希望當天晚上就收到通知，而不是等到隔天凌晨
- 這次只跑 US market 股票，不跑台股

**GitHub Actions 用量估算**:
- 每次執行約 2-3 分鐘（抓 20-30 檔股票 + 計算指標）
- 3 次/天 × 3 分鐘 × 30 天 = 270 分鐘/月
- 免費額度 2000 分鐘，現有 pipeline 約用 300-400 分鐘，合計 ~700 分鐘，安全範圍內

#### GitHub Actions Workflow

**新檔案**: `.github/workflows/stock-monitor.yml`

```yaml
schedule:
  - cron: '35 5 * * 1-5'   # 台股收盤後 (weekdays only)
  - cron: '5 21 * * 1-5'   # 美股收盤後
  - cron: '0 14 * * 1-5'   # 美股盤中
```

---

### 7. 通知系統

#### LINE Official Account

**新檔案**: `lib/notifications/line.ts`

- 使用 LINE Messaging API（LINE Notify 已於 2025/3 停止服務）
- 免費方案：200 則推播/月（個人用綽綽有餘，每天 3 次監控 × 平均 1-2 則通知 ≈ 90-180 則/月）
- 需要：
  1. 建立 LINE Official Account（免費）
  2. 啟用 Messaging API
  3. 取得 Channel Access Token + 你的 User ID
- 通知格式：Flex Message（支援豐富排版）

#### Web Dashboard

**新檔案**: `app/watchlist/page.tsx`

簡單的 watchlist 頁面：
- 顯示所有監控中的股票、當前價格、KOL 觀點
- 最近的 alerts 歷史
- 可手動 pause/archive 股票
- 簡單密碼保護（或用現有 Supabase magic link auth）

#### Email（複用 Resend）

- 加一個簡化版 alert email template
- 適合存檔、回顧

---

### 8. 通知訊息格式

```
📊 股票觀察提醒：AAPL

現價：$182.50（從近 20 日高點回檔 7.2%）
RSI(14)：28.5（偏低）

📣 KOL 觀點：
• 股癌（4/25）：看好雲端業務成長
• NaNa（4/23）：建議 $185 以下可留意

技術面：價格接近布林通道下緣，RSI 進入偏低區間。

⚠️ 以上為技術指標與 KOL 公開觀點彙整，僅供教育參考，非投資建議。
```

---

### 9. 法律風險控管

沿用 `docs/commercialization-analysis.md` 的建議：
- 通知標題用「觀察提醒」，不用「買入訊號」
- 永遠附上 disclaimer
- 只引述 KOL 公開觀點，不產生自己的投資建議
- 個人使用階段風險極低，分享給親友時加上 disclaimer 即可

---

## 需要修改的檔案清單

| 操作 | 檔案路徑 |
|------|---------|
| 新增 | `supabase/migrations/008_add_stock_monitoring.sql` |
| 新增 | `lib/ticker-utils.ts` |
| 新增 | `lib/stock-data.ts` |
| 新增 | `lib/technical-indicators.ts` |
| 新增 | `lib/entry-point-detector.ts` |
| 新增 | `lib/pipeline/populate-watchlist.ts` |
| 新增 | `lib/pipeline/expand-sectors.ts` |
| 新增 | `lib/notifications/line.ts` |
| 新增 | `lib/notifications/email-alert.ts` |
| 新增 | `scripts/stock-monitor.ts` |
| 新增 | `.github/workflows/stock-monitor.yml` |
| 新增 | `app/watchlist/page.tsx` |
| 修改 | `lib/pipeline/runner.ts` — 加入 Step 4.5 + 4.6 |
| 修改 | `lib/openrouter.ts` — AnalysisResult 加入 sectorThemes、分析 prompt 調整 |
| 修改 | `package.json` — 加入 `yahoo-finance2`, `technicalindicators`, script |
| 修改 | `.env.example` — 加入 LINE 相關 env vars |

## 需要複用的現有程式

| 程式 | 位置 | 複用方式 |
|------|------|---------|
| `Signal` interface | `lib/openrouter.ts:120-129` | 讀取 ticker, priceLevel, confidence |
| `ConsolidatedReport` | `lib/openrouter.ts:417+` | 從 bullishSignals 提取 watchlist 資料 |
| `isAllowedTicker()` | `lib/openrouter.ts:524-536` | ticker 驗證邏輯 |
| Supabase client | `lib/supabase.ts` | 資料庫操作 |
| Logger | `lib/logger.ts` | 統一 log 格式 |
| Pipeline runner pattern | `lib/pipeline/runner.ts` | 新 step 遵循相同 error handling 模式 |
| Perplexity 搜尋 | `lib/stock-research.ts` | 產業展開時複用 Perplexity 搜尋邏輯 |

## 新增 Dependencies

```
yahoo-finance2        # 股價資料（免費、無需 API key）
technicalindicators   # 技術指標計算（MIT, pure JS）
@line/bot-sdk         # LINE Messaging API SDK
```

## 新增 Environment Variables

```
LINE_CHANNEL_ACCESS_TOKEN   # LINE Messaging API token
LINE_CHANNEL_SECRET         # LINE channel secret
LINE_USER_ID                # Tommy's LINE user ID（接收通知用）
```

---

## 驗證方式

1. **Watchlist 填充**: 跑一次 `npm run pipeline`，檢查 `watchlist_stocks` table 是否有正確的股票資料
2. **價格抓取**: 跑 `scripts/stock-monitor.ts`，確認台股和美股都能正確抓到價格存入 `stock_prices`
3. **技術指標**: 用已知股票驗算 RSI、SMA 值是否合理
4. **入場偵測**: 手動插入一筆 RSI < 30 的假資料，確認 alert 被正確觸發
5. **LINE 通知**: 發送測試通知到自己的 LINE
6. **Dashboard**: 瀏覽 `/watchlist` 頁面確認資料正確顯示
7. **End-to-end**: 完整跑一次 stock-monitor workflow，確認從抓價格到發通知的完整流程

---

## 實作注意事項

- **在新 branch 上開發**：`feature/stock-monitor`，不影響 main branch
- **不能破壞現有電子報流程**：新的 Step 4.5 和 4.6 必須是 non-blocking——即使 watchlist/sector 步驟失敗，pipeline 仍繼續執行 Step 5 和 6
- **將此 plan 存為 `docs/stock-monitor-plan.md`** 作為正式文件

---

## Phase 2（之後再做）

- AI 增強分析：用 Gemini 分析技術面 + KOL 觀點，給出更智慧的入場判斷
- 股票自動移除：如果 KOL 不再提及且技術面轉弱，自動 archive
- 週報摘要：每週一發送 watchlist 週報（價格變化、新增/移除的股票）
- 分享功能：產生可分享的 watchlist snapshot 頁面
