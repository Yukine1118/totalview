import type { z } from "zod";
import type { aiUsageSchema } from "@/lib/import/schema";
import type { AiUsage } from "@/lib/types";
import type { AiService, UsageAdapter, UsageItem } from "../types";

/** 取該服務資料時間最新的一筆手動匯入;沒有就是無資料 */
export function latestManual(service: AiService, items: UsageItem[]): AiUsage {
  const hit = items
    .filter((i) => i.kind === "ai_usage" && i.key === service)
    .sort((a, b) => new Date(b.as_of).getTime() - new Date(a.as_of).getTime())[0];
  if (!hit) return { service, usedPct: null, resetAt: null, source: "manual", bot: "", asOf: null };
  const p = hit.payload as z.infer<typeof aiUsageSchema>;
  return { service, usedPct: p.used_pct, resetAt: p.reset_at ?? null, source: p.source, bot: hit.bot, asOf: p.as_of, note: p.note };
}

export function manualAdapter(service: AiService, whereToCheck: string, checkUrl?: string): UsageAdapter {
  return {
    service,
    mode: "manual",
    whereToCheck,
    checkUrl,
    read: async ({ items }) => latestManual(service, items),
  };
}
