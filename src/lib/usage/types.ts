import type { AiUsage } from "@/lib/types";

export const AI_SERVICES = ["Claude Pro", "Gemini Pro", "Grok Premium", "Google AI Studio"] as const;
export type AiService = (typeof AI_SERVICES)[number];

/** 從資料庫讀到的匯入資料(adapter 需要時可以用) */
export type UsageItem = { bot: string; kind: string; key: string; as_of: string; payload: unknown };

/**
 * 每個 AI 服務一個 adapter。
 * - mode "manual":讀使用者匯入的最新數字。
 * - mode "auto":自己去官方來源拿(目前沒有服務符合條件,見 docs/ai-usage-feasibility.md)。
 * 規則:拿不到就回傳 usedPct = null(畫面顯示「無資料」),不可以猜。
 */
export type UsageAdapter = {
  service: AiService;
  mode: "manual" | "auto";
  /** 給使用者看的:去哪裡看用量 */
  whereToCheck: string;
  checkUrl?: string;
  read(ctx: { items: UsageItem[]; now: Date }): Promise<AiUsage>;
};
