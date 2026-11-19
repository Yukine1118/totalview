# AI 作戰室 v2 — 實作計畫

## Context(為什麼要做)
v1 是單一 HTML,資料存在瀏覽器裡,換裝置就不見,也沒有登入保護。v2 要變成部署在 Vercel、資料存在雲端資料庫、只有 Yukine1118 能登入看的個人儀表板,同時保留 v1 的單欄卡片、亮暗主題風格。

**現況**:repo `Yukine1118/totalview` 是空的(沒有任何 commit),**`ai-war-room-v1.html` 不在 repo 裡**。開工前請把 v1 檔案放進專案根目錄(或貼給我),我才能照它的配色與排版重做;沒有的話我會先用中性的卡片風格,之後再對齊。

---

## 1. 技術選擇(白話版)
| 用途 | 選擇 | 為什麼 |
|---|---|---|
| 網站框架 | Next.js 15(App Router)+ TypeScript + Tailwind | 你指定的;Vercel 原生支援,一鍵部署 |
| 登入 | **Auth.js(NextAuth v5)+ GitHub OAuth** | 新手最常見、文件最多。登入後檢查 GitHub **數字 user id**(比帳號名更可靠,改名也不會被冒用)與帳號 `Yukine1118` |
| 資料庫 | Supabase(Postgres) | 免費額度夠、有網頁介面可以直接看資料 |
| 資料庫存取 | **只在伺服器端**用 service role key 讀寫;資料表全部開 RLS 且不給任何公開 policy | 等於「瀏覽器永遠碰不到資料庫」,就算有人拿到網址或 anon key 也讀不到 |
| 格式驗證 | zod + jsonc-parser | zod 檢查欄位;jsonc-parser 能把錯誤換算成「第幾行第幾欄」 |
| 圖表 | 自己畫的 SVG 迷你曲線 + Recharts(資產曲線) | 輕量、亮暗主題好控制 |
| 測試 | Vitest(驗證邏輯、過期判斷)+ Playwright(未登入擋人、手機版截圖) | |

不建議換成別的方案:這套對「Vercel + 登入 + 雲端資料」是最直接的組合。

## 2. 安全設計(硬性原則 2、4)
- `middleware.ts` 攔截**所有**頁面與 `/api/*`(只放行 `/login`、`/api/auth/*`、靜態檔)。未登入:頁面導去 `/login`,API 回 401,內容一律不輸出。
- 每個 server action / API route 再檢查一次 session(雙重保險,不只靠 middleware)。
- `signIn` callback:`profile.id === ALLOWED_GITHUB_ID` 才放行,其他帳號直接拒絕。
- 第一個 commit 就放 `.gitignore`(`.env*`、`.vercel`、`node_modules` 等)與 `.env.example`(只有變數名稱,沒有值)。
- 環境變數:`AUTH_SECRET`、`AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`、`ALLOWED_GITHUB_ID`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`GITHUB_READ_TOKEN`(唯讀 fine-grained token)。**完全沒有交易所 key**。
- 加一個 `npm run check:secrets` 腳本(gitleaks 或簡單 regex)在 commit 前掃描。

## 3. 資料表設計(Supabase)
核心概念:**每次匯入 = 一個版本**,所有資料列都掛在某次匯入底下;「還原」= 把舊版本內容複製成一個新版本(只新增、不刪除,歷史永遠可查)。

```
imports          id, created_at, source('paste'|'restore'|'demo'), raw_text, restored_from(nullable), note
import_items     id, import_id, bot, kind, as_of, payload(jsonb), schema_version
                 → 每個 bot 的每種資料一筆;「目前資料」= 每個 (bot, kind) 最新的一筆
ai_usage         (view 或展開表) service, plan, used_ratio, reset_at, source('auto'|'manual'), bot, as_of
bot_status       bot, status('ok'|'warn'|'stop'), last_run_at, note, next_expected_at, as_of
positions        bot, account('real'|'paper'), market('TW'|'CRYPTO'), symbol, qty, avg_cost, last_price, currency, as_of
trades           bot, account, market, symbol, side, qty, price, fee, currency, executed_at, as_of
equity_snapshots bot, account, currency, equity, cash, as_of
strategies       bot, name, return_pct, max_drawdown_pct, trade_count, oos_return_pct, oos_period, curve(number[]), as_of
fx_rates         pair('USDTWD'...), rate, as_of, source   ← 匯率也要有來源與時間,沒有就顯示「無匯率」不換算
```
所有資料都有 `is_demo` 欄位;DEMO 資料畫面上一律有「DEMO」標籤。
寫入走 Postgres function(transaction),匯入要嘛全部成功、要嘛全部不寫。

## 4. JSON 格式(給 bot 用)
每個 bot 輸出一個物件,外面包 `===AIWR-BEGIN===` / `===AIWR-END===` 標記,方便一次貼多段、也能從整段 Grok 回覆裡自動抓出來:
```json
{
  "schema": "aiwr/v1",
  "bot": "tw-swing-bot",
  "account": "paper",
  "generated_at": "2026-11-19T14:35:00+08:00",
  "bot_status": { "status": "ok", "last_run_at": "...", "note": "..." },
  "positions": [ { "market": "TW", "symbol": "2330", "qty": 1000, "avg_cost": 980, "last_price": 1010, "currency": "TWD", "price_as_of": "..." } ],
  "trades": [ ... ], "equity_snapshots": [ ... ], "strategies": [ ... ], "ai_usage": [ ... ]
}
```
- 每個區塊可省略(沒有就不更新);`bot` 與時間欄位必填,時間必須帶時區。
- 交付物:`docs/grok-output-format.md`(繁中、完整範例、常見錯誤),也提供 `docs/aiwr-v1.schema.json` 正式 JSON Schema。

## 5. 匯入頁 `/import`
1. 貼上 → 自動切出每段 JSON → 逐段解析。
2. 錯誤訊息例:「第 2 段(bot: tw-swing-bot)第 14 行:positions[0].qty 應該是數字,收到 "1000股"」。
3. 預覽:每個 bot 一張卡,列出「將新增/更新哪些資料、與目前資料的差異、資料時間」,並警告「資料時間比現有的還舊」。
4. 按「確認匯入」才寫入。
5. `/import/history`:歷史版本列表,可看原文、可一鍵「還原成這版」(會先預覽)。

## 6. 過期判斷設定檔 `config/freshness.ts`
```ts
ai_usage:    { auto: '15m', manual: '24h' }
real_tw:     { rule: 'tw_close', readyAfter: '14:30 Asia/Taipei', graceHours: 18, tradingDaysOnly: true }
real_crypto: { rule: 'daily_close', closeAt: '00:00 UTC', graceHours: 6 }
paper / strategies / bot_status: 依 bot 設定 { schedule: 'cron 表達式', graceMinutes }
```
畫面規則:每個數字旁小字顯示資料時間(「3 小時前 · 11/19 14:35」);狀態色 = 綠(新鮮)/ 黃(接近過期)/ 紅(已過期,加「資料過期」字樣)/ 灰(無資料)。台股假日先用週末判斷,國定假日清單放設定檔手動維護。

## 7. AI 用量可行性調查(初步,adapter 階段會逐一實測)
| 服務 | 官方 API / 可靠來源? | 結論 |
|---|---|---|
| Claude Pro(網頁/App 訂閱額度) | 沒有公開 API 可查訂閱額度 | **手動**。補充:Claude Code 在你自己電腦有本機用量紀錄(`~/.claude/projects` 的 JSONL),可寫一支本機小腳本整理後**主動推送**到網站;但網站在 Vercel 讀不到你電腦,所以這是「選配的半自動」 |
| Gemini Pro(Google AI Pro 訂閱) | 沒有公開 API 查消費者訂閱額度 | **手動** |
| Grok Premium(X / SuperGrok 訂閱) | 沒有公開 API 查消費者訂閱額度 | **手動** |
| Google AI Studio / Gemini API | 用量與配額在 Google Cloud 專案下,理論上可用 Cloud Monitoring API(唯讀權限)查請求數 | **可能自動,需驗證**;若需要開 GCP 服務帳號且過於複雜,就退回手動 |

原則:不爬網頁、不用登入 cookie、不違反服務條款。每個服務一個 adapter(`lib/usage/adapters/*.ts`),介面一致:`fetch(): UsageReading | null`;手動 adapter 就是讀最近一次匯入的值。

## 8. 頁面
- **`/`**:A. AI 用量卡片(進度條、重置時間、自動/手動標籤、資料時間)B. bot 閉環流程(每個 bot 一個節點,ok/warn/stop 顏色,手機上改直式)C. GitHub 進度(最近 commit、open issues/PR)
- **`/portfolio/real`**:持股明細、成本、現價、未實現損益、總資產(分 TWD / USD,有匯率才顯示換算)、資產曲線、bot 最新摘要
- **`/portfolio/paper`**:同上 + 策略績效表(報酬、最大回撤、交易次數、樣本外、迷你曲線)。**整頁頂部固定橘色斜紋「模擬 PAPER」色帶 + 背景色調不同**,不可能和真實頁搞混
- 共用:頂部導覽、亮暗主題切換(記在 localStorage)、手機單欄、表格在手機改成卡片式

## 9. 分階段(每階段完成後停下讓你確認)
| # | 內容 | 你怎麼看成果 |
|---|---|---|
| 1 | 骨架 + 登入 + `.gitignore` + CLAUDE.md | 本機截圖;Playwright 驗證未登入全部被擋 |
| 2 | 頁面 1(DEMO 資料) | 手機/桌機截圖 |
| 3 | 頁面 2 real/paper(DEMO) | 截圖,檢查模擬色帶 |
| 4 | JSON 匯入 + 歷史還原 + Supabase 建表 + 格式說明文件 | 用錯誤範例測試錯誤訊息 |
| 5 | 部署 Vercel | 你用手機實際登入 |
| 6 | GitHub 進度 | 頁面上看到真實 commit |
| 7 | 各服務用量 adapter(依調查結果) | |
| 8 | (第二版,只寫待辦)GitHub Actions 定時呼叫 xAI API 全自動 | — |

**建議調整**:把「部署 Vercel」提前到第 1 階段之後。原因:登入(OAuth 回呼網址)在正式網址上才算真的測過,早點在手機上確認比較安心。這不影響其他順序,請你決定。

## 10. 需要你準備的(到時我會一步步教)
1. v1 HTML 檔。
2. GitHub OAuth App(本機與正式網址各一個,或用同一個改回呼網址)。
3. Supabase 專案(我可以透過已連接的 Supabase 工具幫你建表,但要你同意)。
4. Vercel 帳號連 GitHub repo。
5. 唯讀 GitHub fine-grained token(只給 Contents/Issues/PR 的 read)。

## 11. 風險
- 手動資料容易忘記更新 → 過期警示就是為此設計。
- Grok 輸出格式可能不穩(漏欄位、加註解、數字帶單位)→ 嚴格驗證 + 錯誤指到行號 + 格式說明含「常見錯誤」。
- 匯率、台股假日若沒資料 → 顯示「無資料」而非猜測。
- Supabase 免費專案閒置一週會暫停 → 寫在 CLAUDE.md,說明如何喚醒。
- service role key 權限很大 → 只放 Vercel 環境變數、只在伺服器程式用,不加 `NEXT_PUBLIC_` 前綴。

## 驗證(驗收標準對應)
- 未登入:Playwright 對每個頁面與 API 發請求,確認只得到導向/401,回應內容不含資料。
- 非 Yukine1118 帳號:單元測試 `signIn` callback 拒絕。
- 手機:Playwright 用 iPhone 尺寸截圖每頁。
- 過期:Vitest 測 freshness 函式(含台股週末、加密日線)。
- 無 key:`check:secrets` 掃描 + 檢查 `.env.example` 只有空值。
