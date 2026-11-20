import type { Overview } from "@/lib/types";

/**
 * ⚠️ DEMO 範例資料:全部是虛構的,只用來看版面。畫面上一律標示「DEMO」。
 * 時間是相對「現在」產生的,這樣才看得到 正常 / 即將過期 / 已過期 / 無資料 四種狀態。
 * 第 4 階段接上 Supabase 後,有真實資料的區塊就不再顯示 DEMO。
 */
export function demoOverview(now: Date = new Date()): Overview {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const later = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

  return {
    aiUsage: {
      isDemo: true,
      data: [
        {
          service: "Claude Pro",
          usedPct: 42,
          resetAt: later(30),
          source: "manual",
          bot: "manual",
          asOf: ago(3 * 60),
          note: "DEMO:手動輸入範例",
        },
        {
          service: "Gemini Pro",
          usedPct: 76,
          resetAt: later(12),
          source: "manual",
          bot: "manual",
          asOf: ago(21 * 60),
          note: "DEMO:接近 24 小時沒更新 → 即將過期",
        },
        {
          service: "Grok Premium",
          usedPct: 95,
          resetAt: later(52),
          source: "manual",
          bot: "manual",
          asOf: ago(30 * 60),
          note: "DEMO:超過 24 小時沒更新 → 資料過期",
        },
        {
          service: "Google AI Studio",
          usedPct: null,
          resetAt: null,
          source: "auto",
          bot: "adapter",
          asOf: null,
          note: "DEMO:自動來源尚未接上 → 無資料",
        },
      ],
    },
    bots: {
      isDemo: true,
      data: [
        { bot: "股市日報", status: "ok", lastRunAt: ago(5 * 60), asOf: ago(5 * 60), note: "DEMO:晨間快訊已送出" },
        { bot: "幣圈情報員", status: "ok", lastRunAt: ago(4 * 60), asOf: ago(4 * 60), note: "DEMO:晨報已送出" },
        { bot: "模擬交易室", status: "warn", lastRunAt: ago(8 * 60), asOf: ago(8 * 60), note: "DEMO:有修正待套用" },
        { bot: "台股模擬交易室", status: "ok", lastRunAt: ago(23 * 60), asOf: ago(23 * 60), note: "DEMO:帳本已更新" },
        { bot: "程式交易", status: "stop", lastRunAt: ago(40 * 60), asOf: ago(40 * 60), note: "DEMO:等待額度,回測暫停" },
      ],
    },
    github: {
      isDemo: true,
      data: {
        asOf: ago(10),
        commits: [
          { kind: "commit", repo: "totalview", title: "DEMO:Add overview page", at: ago(15) },
          { kind: "commit", repo: "totalview", title: "DEMO:Fix GitHub sign-in", at: ago(3 * 60) },
          { kind: "commit", repo: "example-bot", title: "DEMO:Tune RSI threshold", at: ago(26 * 60) },
        ],
        openIssues: [{ kind: "issue", repo: "totalview", title: "DEMO:Add TW market holidays", at: ago(2 * 24 * 60) }],
        openPrs: [{ kind: "pr", repo: "totalview", title: "DEMO:Stage 2 overview", at: ago(60) }],
      },
    },
  };
}
