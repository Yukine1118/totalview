# CLAUDE.md — AI 作戰室 v2

給 Claude Code 與未來的自己看的專案說明。詳細計畫見 `docs/plan.md`。

## 專案是什麼
個人儀表板網站:AI 訂閱用量、bot 閉環狀態、真實/模擬部位、策略績效。
v1 是單頁 HTML(根目錄 `ai-war-room-v1.html`,只當參考,不部署)。
v2 保留 v1 的資訊與風格:**單欄(最寬 980px)、卡片(圓角 10px)、亮暗主題**;配色、字型(Noto Sans TC + JetBrains Mono 數字)沿用 v1,定義在 `src/app/globals.css`。
模擬頁專用色為紫色 `--paper`,刻意避開狀態色(綠 ok / 黃 warn / 紅 stop)。

使用者是 Claude Code 新手:用白話解釋決定;**每個階段完成後停下來讓使用者確認**。

## 硬性原則(最高優先,任何改動都不能違反)
1. 部署 Vercel,手機與電腦都要好看(RWD)。
2. **一定要登入才能看**:GitHub OAuth,只允許帳號 `Yukine1118`(同時比對數字 id `ALLOWED_GITHUB_ID`)。不靠隱藏網址。
   - `src/middleware.ts` 擋所有頁面與 `/api/*`,只放行 `/login`、`/api/auth/*`,以及**路徑完全等於** `/api/ingest`(子路徑、`/api/ingests` 都不放行)。
   - `/api/ingest` 不靠 GitHub 登入,只認環境變數 `INGEST_TOKEN`。沒設定就回 503,不寫入。比對是常數時間。回應不含庫裡的資料。
   - 伺服器端讀「給人看的資料」前仍用 `getAllowedSession()` 檢查一次。
   - 新增頁面 / API 時,把路徑加進 `tests/e2e/auth.spec.ts` 的清單。`/api/ingest` 改測 `tests/e2e/ingest.spec.ts`,相近路徑仍留在登入清單。
3. 網站以唯讀為主。寫入只有兩條,都進同一套版本歷史(可還原):登入後貼 JSON,或本機腳本用 token `POST /api/ingest`(先驗證,不合法就不寫)。**不做任何下單或交易功能。**
4. **不存放任何有交易或提款權限的 key。** secret 只放 `.env.local` / Vercel 環境變數。`SUPABASE_SERVICE_ROLE_KEY` 只在伺服器端用,禁止 `NEXT_PUBLIC_` 前綴。commit 前跑 `npm run check:secrets`。
5. **不編造數據。** 沒資料顯示「無資料」;範例資料一律標示 **DEMO**。匯率沒有來源就不換算。
6. 每個數字旁顯示「資料時間」;超過預期更新時間用顏色警示「資料過期」(設定在 `src/config/freshness.ts`,第 2 階段建立)。

## 更新頻率(用來判斷是否過期)
- AI 用量:自動來源每幾分鐘;手動來源每天。
- 真實持股:盤後。台股收盤後每日一次;加密貨幣以每日收線(00:00 UTC)為準。
- 模擬交易、策略績效、bot 狀態:跟著各 bot 的執行排程。

## 頁面
- `/` 總覽:A. AI 用量卡片(Claude Pro、Gemini Pro、Grok Premium、Google AI Studio;已用比例、重置時間、來源 自動/手動、最後更新)B. bot 閉環狀態(ok/warn/stop、最後執行、備註)C. GitHub 工作進度(最近 commit、open issues/PR)
- `/portfolio/real` 真實部位、`/portfolio/paper` 模擬部位(整頁「模擬」色帶,兩頁必須一眼分得出來)。持股明細、成本、現價、未實現損益、總資產、資產曲線、bot 摘要;台股與加密貨幣幣別分開或可換算。策略績效表(報酬、最大回撤、交易次數、樣本外、迷你曲線)放模擬頁。
- `/import` 貼 JSON 匯入(可一次貼多個 bot,自動辨識 bot,錯誤指出第幾行)、`/import/history` 歷史版本與還原(標示貼上 / 還原 / 自動匯入)。

## 資料流
- 手動:Grok bot 回報最後附固定格式 JSON(schema `aiwr/v1`,外包 `===AIWR-BEGIN===` / `===AIWR-END===`),使用者複製後登入貼上。
  區塊:ai_usage、bot_status、positions、trades、equity_snapshots、strategies;每筆都有 bot 名稱與資料時間(含時區)。
- 自動:本機腳本 `scripts/aiwr-upload` 讀 bot 的檔案,編成同一種 JSON,`POST /api/ingest`(Bearer `INGEST_TOKEN`)。
  和貼上共用解析器與版本歷史。內容和該 bot 最新一版相同就略過,不新增版本。交易有本機水位,只送一次。
  做法與你要手動做的設定見 `docs/ingest.md`。檔案欄位假設見 `scripts/aiwr-upload/README.md`。
- 給 Grok 的格式說明:`docs/grok-output-format.md`(第 4 階段產出)。
- 資料庫:Supabase 專案 `ai-war-room`(ref `owptjogmzkxdktkjkmmg`,東京 ap-northeast-1;與另一個 app 的專案分開)。
  - 結構在 `supabase/migrations/`:`aiwr_imports`(每次匯入一個版本,存原文)、`aiwr_items`(拆開的資料)、
    view `aiwr_current`(每個 bot+kind+key 最新且未還原的一筆)、函式 `aiwr_import`(貼上,來源 `paste`) / `aiwr_restore` / `aiwr_ingest`(自動匯入,來源 `ingest`,migration `0003`)。
    `0003` 要在 Supabase SQL Editor 手動執行;還沒跑時 `/api/ingest` 回 `ingest_not_ready`,不寫入。
  - 所有表開 RLS 且無 policy(advisor 的 INFO「RLS enabled no policy」是刻意的);anon/authenticated 沒有任何權限。
  - 還原 = 把舊版本複製成新版本,並把「之後同 bot 的資料」標記 reverted(只增不刪)。
  - 有設定 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → 網站只顯示真實資料(沒有就「無資料」);沒設定 → DEMO。
- 匯入格式定義:`src/lib/import/schema.ts`(zod);解析與行號:`src/lib/import/parse.ts`。
  改格式時同步更新 `docs/grok-output-format.md` 並執行 `npm run gen:schema`(產生 `docs/aiwr-v1.schema.json`)。
  單元測試會檢查說明文件裡的範例都能匯入。

## 部署
- Vercel 專案 `ai-war-room`(帳號 yukine1118),正式網址 https://ai-war-room-gamma.vercel.app
- Production branch = repo 預設分支(目前是 `claude/busy-franklin-t9cy44`);push 就會自動部署。
- Vercel 環境變數:`AUTH_SECRET`(sensitive)、`ALLOWED_GITHUB_LOGIN`、`ALLOWED_GITHUB_ID`=339299954;
  `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` 由使用者在 Vercel 後台自行填入(不經過對話)。
  `SUPABASE_URL`(plain)、`SUPABASE_SERVICE_ROLE_KEY`(使用者填,sensitive)、`GITHUB_READ_TOKEN`(選填,使用者填;fine-grained 唯讀)、
  `INGEST_TOKEN`(sensitive,自動匯入用;沒設定則 `/api/ingest` 回 503)。設完要重新部署。
- Vercel 函式區域固定 `hnd1`(東京,`vercel.json`),和資料庫同區。
- GitHub OAuth App callback:`https://ai-war-room-gamma.vercel.app/api/auth/callback/github`

## 已知問題紀錄
- GitHub OAuth 回呼會帶 `iss` 參數;next-auth 必須 ≥ 5.0.0-beta.32(@auth/core ≥ 0.41.3),
  否則登入失敗(`unexpected "iss" response parameter value`)。`tests/unit/github-provider.test.ts` 會擋住降版。

## 技術與指令
Next.js 15 (App Router) + TypeScript + Tailwind v4、Auth.js v5、Supabase、Vercel。
```
npm run dev            # 本機開發(需要 .env.local)
npm run build          # 正式 build
npm test               # 單元測試(Vitest)
npm run test:e2e       # E2E(Playwright,用假環境變數,不需要真的 OAuth)
npm run typecheck
npm run lint
npm run check:secrets  # 掃描是否誤放 key
npm run upload:aiwr -- --config ./aiwr.upload.json --dry-run
```
E2E 測試用 `tests/e2e/helpers.ts` 的 `loginAs()` 以測試密鑰產生 session cookie;**正式程式碼裡沒有任何登入後門**。

## 目錄
- `src/auth.ts` 登入設定、`getAllowedSession()`
- `src/lib/allowlist.ts` 白名單判斷(純函式,有單元測試)
- `src/middleware.ts` 全站守門
- `src/components/` 共用 UI(`AppShell`、`Card`、`ThemeToggle`、`DataTime`(資料時間 + 過期警示)、`Section`、`DemoBadge`)
- `src/components/overview/` 總覽頁元件(`UsageCards`、`BotFlow`、`GithubProgressCard`)
- `src/components/portfolio/` 部位頁元件(`PortfolioView`、`StrategyTable`);`src/components/charts.tsx`(`Sparkline`、`EquityChart`,純 SVG)
- `src/lib/portfolio.ts` 損益/幣別加總/匯率換算/格式(有單元測試)。**不同幣別不直接相加;沒有匯率就不換算(USDT 不視為 USD)。**
- `AppShell` 的 `variant="paper"`:模擬頁的紫色外框 + 斜紋「模擬交易 PAPER」色帶
- `src/config/freshness.ts` 過期門檻設定;`src/lib/freshness.ts` 判斷邏輯(有單元測試)
- `src/lib/types.ts` 畫面資料型別;`src/lib/data/*` 伺服器端資料來源;`src/lib/demo/*` DEMO 範例(只在未設定資料庫時使用)
- `src/lib/db.ts` Supabase 存取(server-only);`src/lib/data/fromItems.ts` 資料庫 items → 畫面型別(有單元測試)
- `src/lib/github.ts` GitHub 進度(唯讀 API;`buildProgress` 有單元測試);`src/lib/data/github.ts` 10 分鐘快取,
  正式環境(`VERCEL`)或有 token 時讀真實資料,否則 DEMO;讀取失敗顯示原因 + 無資料
- `src/app/import/` 匯入頁、server actions(`actions.ts`)、歷史版本與還原、`instructions/`(產生 bot 指令)、`usage/`(手動更新 AI 用量)
- `src/lib/usage/` AI 用量 adapter 與手動表單 → JSON(`manualReport.ts`)
- `scripts/check-secrets.mjs` key 掃描
- `scripts/aiwr-upload/` 本機上傳腳本(設定範例 `config.example.json`,說明 `README.md`)。真正的設定與水位檔不要 commit
- `src/app/api/ingest/route.ts` 寫入端點;`src/lib/ingest/` 驗證、常數時間比對、冪等
- `docs/` 計畫與文件(`docs/ingest.md` 是自動匯入的操作說明)

## 階段進度
- [x] 1. 骨架 + 登入
- [x] 2. 頁面 1(DEMO)
- [x] 3. 頁面 2 real / paper(DEMO)
- [x] 4. JSON 匯入 + 歷史還原 + Supabase 建表 + Grok 格式說明(2026-11-20 使用者實測匯入成功)
- [x] 5. 部署 Vercel(已提前完成,2026-11-20 使用者實測 GitHub 登入成功)
- [x] 6. GitHub 進度(讀 GitHub API,10 分鐘快取;`GITHUB_READ_TOKEN` 已設定)
- [x] 6b. 「產生 bot 指令」工具 `/import/instructions`(`src/lib/import/instructions.ts`;單元測試跑遍 511 種區塊組合 × 2 市場,保證範例能匯入)
- [x] 7. 各服務用量 adapter:四個都是手動(查證結果見 `docs/ai-usage-feasibility.md`);`/import/usage` 手動更新表單 — 待使用者確認
- [x] 8. 自動匯入:`POST /api/ingest` + 本機腳本 `scripts/aiwr-upload`(`docs/ingest.md`)。合併後要在 Vercel 設 `INGEST_TOKEN` 並重新部署,且在 Supabase 執行 `supabase/migrations/0003_aiwr_ingest_source.sql` — 待使用者做完這兩步再確認

## AI 用量(第 7 階段結論,2026-11 查證)
- 每個服務一個 adapter:`src/lib/usage/adapters/*.ts`,登記在 `src/lib/usage/index.ts`(`USAGE_ADAPTERS`)。
- 四個服務目前都是 **manual**(讀最新一筆匯入的 `ai_usage`);沒有官方 API 可查訂閱額度。詳見 `docs/ai-usage-feasibility.md`。
- 手動更新:`/import/usage` 表單 → 產生 aiwr/v1 JSON(bot `manual`)→ 走同一條匯入流程(有歷史版本、可還原)。
- Google AI Studio 可能可用 Cloud Monitoring 自動化,需使用者提供 GCP 專案與唯讀服務帳號,且要先實測。
- 原則:不爬蟲、不用登入 cookie、不違反服務條款;讀不到就 `usedPct: null`,不猜。

## 待辦(第二版,先不做)
- [ ] 匯入頁加「交易紀錄」顯示頁(目前 trades 只存進資料庫,畫面尚未使用)。
- [ ] (選做)Google AI Studio 用量改自動:Cloud Monitoring API + 唯讀服務帳號,先實測免費方案是否有數據。
- [ ] 評估改用 GitHub Actions 定時執行 bot 邏輯,再呼叫已完成的 `/api/ingest`(寫入 token 已做好)。
  - 仍要評估:xAI API 費用、bot 邏輯能否脫離 Grok 對話、失敗通知。

## 注意事項
- **repo 是公開的(public)。** 不要 commit 任何真實資料(持股、損益、bot 回報、用量數字);真實資料只進 Supabase。範例一律標 DEMO。
- Supabase 免費專案閒置約一週會暫停,需到 Supabase 後台按 Restore 喚醒。
- 台股國定假日清單需手動維護在設定檔。
