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
   - `src/middleware.ts` 擋所有頁面與 `/api/*`;伺服器端讀資料前再用 `getAllowedSession()` 檢查一次。
   - 新增頁面 / API 時,把路徑加進 `tests/e2e/auth.spec.ts` 的清單。
3. 網站以唯讀為主。唯一寫入 = 登入後貼 JSON 匯入(先驗證、顯示預覽、保留歷史版本可還原)。**不做任何下單或交易功能。**
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
- `/import` 貼 JSON 匯入(可一次貼多個 bot,自動辨識 bot,錯誤指出第幾行)、`/import/history` 歷史版本與還原。

## 資料流
- 第一版:Grok bot 回報最後附固定格式 JSON(schema `aiwr/v1`,外包 `===AIWR-BEGIN===` / `===AIWR-END===`),使用者複製後登入貼上。
  區塊:ai_usage、bot_status、positions、trades、equity_snapshots、strategies;每筆都有 bot 名稱與資料時間(含時區)。
- 給 Grok 的格式說明:`docs/grok-output-format.md`(第 4 階段產出)。
- 資料庫:Supabase 專案 `ai-war-room`(ref `owptjogmzkxdktkjkmmg`,東京 ap-northeast-1;與另一個 app 的專案分開)。
  - 結構在 `supabase/migrations/`:`aiwr_imports`(每次匯入一個版本,存原文)、`aiwr_items`(拆開的資料)、
    view `aiwr_current`(每個 bot+kind+key 最新且未還原的一筆)、函式 `aiwr_import` / `aiwr_restore`。
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
- `src/lib/types.ts` 畫面資料型別;`src/lib/data/*` 伺服器端資料來源(目前回傳 DEMO);`src/lib/demo/*` DEMO 範例
- `scripts/check-secrets.mjs` key 掃描
- `docs/` 計畫與文件

## 階段進度
- [x] 1. 骨架 + 登入
- [x] 2. 頁面 1(DEMO)
- [x] 3. 頁面 2 real / paper(DEMO)
- [x] 4. JSON 匯入 + 歷史還原 + Supabase 建表 + Grok 格式說明 — 待使用者設定 secret key 並確認
- [x] 5. 部署 Vercel(已提前完成,2026-11-20 使用者實測 GitHub 登入成功)
- [ ] 6. GitHub 進度
- [ ] 7. 各服務用量 adapter(依可行性調查)

## AI 用量可行性(初步,第 7 階段實測)
| 服務 | 結論 |
|---|---|
| Claude Pro | 無公開 API 查訂閱額度 → 手動。選配:本機腳本讀 Claude Code 的 `~/.claude/projects` JSONL 後主動推送 |
| Gemini Pro(訂閱) | 無公開 API → 手動 |
| Grok Premium | 無公開 API → 手動 |
| Google AI Studio / Gemini API | 可能可用 Cloud Monitoring API 唯讀查詢,需驗證;不行就手動 |
原則:不爬蟲、不用登入 cookie、不違反服務條款;每個服務一個 adapter。

## 待辦(第二版,先不做)
- [ ] 匯入頁加「交易紀錄」顯示頁(目前 trades 只存進資料庫,畫面尚未使用)。
- [ ] 評估改用 GitHub Actions 定時呼叫 xAI API 執行 bot 邏輯,直接寫入資料庫,做到全自動。
  - 需評估:xAI API 費用、bot 邏輯能否脫離 Grok 對話、寫入端點的驗證方式(獨立的寫入 token,只能寫不能讀)、失敗通知。

## 注意事項
- **repo 是公開的(public)。** 不要 commit 任何真實資料(持股、損益、bot 回報、用量數字);真實資料只進 Supabase。範例一律標 DEMO。
- Supabase 免費專案閒置約一週會暫停,需到 Supabase 後台按 Restore 喚醒。
- 台股國定假日清單需手動維護在設定檔。
