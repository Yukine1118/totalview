/**
 * 畫面用的資料型別。之後 JSON 匯入(aiwr/v1)與 Supabase 都會轉成這些型別。
 * 所有時間都是 ISO 字串(含時區)。每筆資料都有 bot 與 asOf(資料時間)。
 */

export type UsageSource = "auto" | "manual";

export type AiUsage = {
  service: string; // 例:Claude Pro
  plan?: string;
  /** 已用百分比 0–100;null = 無資料 */
  usedPct: number | null;
  resetAt: string | null;
  source: UsageSource;
  bot: string; // 誰回報的(手動 = "manual")
  asOf: string | null;
  note?: string;
};

export type BotState = "ok" | "warn" | "stop";

export type BotStatus = {
  bot: string;
  status: BotState;
  lastRunAt: string | null;
  note?: string;
  asOf: string | null;
};

export type GithubItem = {
  kind: "commit" | "issue" | "pr";
  repo: string;
  title: string;
  url?: string;
  at: string;
};

export type GithubProgress = {
  asOf: string | null;
  commits: GithubItem[];
  openIssues: GithubItem[];
  openPrs: GithubItem[];
};

/** 每個區塊的資料 + 是否為 DEMO 範例 */
export type Section<T> = { isDemo: boolean; data: T; /** 讀取失敗的原因(顯示給使用者) */ error?: string };

export type Overview = {
  aiUsage: Section<AiUsage[]>;
  bots: Section<BotStatus[]>;
  github: Section<GithubProgress>;
};

// ───────── 部位(第 3 階段) ─────────

export type Account = "real" | "paper";
export type Market = "TW" | "CRYPTO";

export type Position = {
  bot: string;
  account: Account;
  market: Market;
  symbol: string;
  name?: string;
  qty: number;
  avgCost: number;
  /** 現價;null = 無報價 */
  lastPrice: number | null;
  currency: string; // TWD / USD / USDT …
  /** 現價的時間 */
  priceAsOf: string | null;
  asOf: string | null;
};

export type EquityPoint = { at: string; equity: number };

/** 一條資產曲線(一個幣別) */
export type EquitySeries = {
  bot: string;
  account: Account;
  market: Market;
  currency: string;
  points: EquityPoint[];
  /** 最新一點的現金(若 bot 有回報) */
  cash?: number | null;
};

export type BotSummary = { bot: string; text: string; asOf: string | null };

/** 匯率:1 單位 base = rate 單位 quote。沒有就不換算。 */
export type FxRate = { base: string; quote: string; rate: number; asOf: string | null; source: string };

export type Strategy = {
  bot: string;
  name: string;
  market: string;
  returnPct: number | null;
  maxDrawdownPct: number | null;
  trades: number | null;
  /** 樣本外報酬;null = 未驗證 */
  oosReturnPct: number | null;
  oosPeriod?: string;
  curve: number[];
  asOf: string | null;
};

export type Portfolio = {
  account: Account;
  positions: Section<Position[]>;
  equity: Section<EquitySeries[]>;
  summaries: Section<BotSummary[]>;
  fx: Section<FxRate[]>;
  strategies?: Section<Strategy[]>;
};
