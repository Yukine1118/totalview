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
export type Section<T> = { isDemo: boolean; data: T };

export type Overview = {
  aiUsage: Section<AiUsage[]>;
  bots: Section<BotStatus[]>;
  github: Section<GithubProgress>;
};
