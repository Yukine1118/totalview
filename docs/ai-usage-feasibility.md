# AI 用量自動化可行性調查(2026-11)

原則:只用官方 API 或可靠來源;不爬網頁、不用登入 cookie、不違反服務條款。拿不到就手動,畫面顯示「手動」標籤與資料時間。

| 服務 | 有官方 API 可查訂閱額度? | 結論 | 去哪裡看 |
|---|---|---|---|
| Claude Pro | 沒有。Anthropic 的 GitHub issue 仍在要求「程式化查詢訂閱用量」的功能 | **手動** | claude.ai → Settings → Usage;Claude Code 輸入 `/usage` |
| Gemini Pro(Google AI Pro) | 沒有公開 API | **手動** | Gemini App 內 |
| Grok Premium / SuperGrok | 沒有。xAI 官方 FAQ 只說明 Settings → Usage;第三方擴充功能是自行估算 | **手動** | grok.com / App → Settings → Usage |
| Google AI Studio / Gemini API | 也許:Cloud Monitoring 有 `generativelanguage.googleapis.com` 的配額指標 | **暫時手動**(見下方) | aistudio.google.com |

## 為什麼不做的方案

- **Claude Code 本機紀錄(`~/.claude/projects/*.jsonl`)**:裡面只有 token 數,沒有 Pro 方案的額度上限,無法換算成「已用 %」。硬算就是編造數字 → 不做。
- **用程式操作 `/usage` 畫面或瀏覽器擷取**:社群有人用 `expect` 讀 Claude Code 的 `/usage` 輸出,但這是擷取畫面、介面一改就壞,也需要在你電腦常駐 → 不做。
- **瀏覽器擴充功能讀 Grok 用量**:作者自己說明是本機估算、不準確 → 不做。

## Google AI Studio 自動化(待決定)

可行路線:Google Cloud Monitoring API(`timeSeries.list`)讀 `generativelanguage.googleapis.com` 的 quota usage / limit 指標。
需要:
1. Gemini API key 所屬的 Google Cloud 專案 ID。
2. 一個只有 `roles/monitoring.viewer`(唯讀)的服務帳號金鑰,放在 Vercel 環境變數。
風險:有開發者回報免費方案的用量不一定出現在 Quota 頁 / Monitoring;要先實測確認讀得到數字,才改成自動。
實作方式:把 `src/lib/usage/adapters/googleAiStudio.ts` 換成 `mode: "auto"` 的 adapter,讀不到時回傳 `usedPct: null`。

## 參考來源
- Anthropic Claude Code issue:沒有程式化查詢訂閱用量的方法 — https://github.com/anthropics/claude-code/issues/44328
- 查看 Claude 用量的方法(claude.ai/settings/usage、/usage)— https://dev.to/raxxostudios/how-to-check-your-claude-usage-limit-3-ways-62o
- xAI Grok FAQ(Settings → Usage)— https://docs.x.ai/grok/faq
- Grok 用量擴充功能說明「本機估算、可能不準」— https://chromewebstore.google.com/detail/grok-rate-limit-display/fcoijmefliggikpeofhojmkpoooocifk
- Gemini API 在 Cloud Monitoring 的配額指標(Datadog 整合文件)— https://docs.datadoghq.com/integrations/google-cloud-generativelanguage/
- 開發者回報配額頁看不到用量 — https://discuss.google.dev/t/how-to-find-which-quota-i-actually-hit/192540
