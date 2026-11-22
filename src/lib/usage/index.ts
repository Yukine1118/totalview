import type { AiUsage } from "@/lib/types";
import { claudePro } from "./adapters/claudePro";
import { geminiPro } from "./adapters/geminiPro";
import { googleAiStudio } from "./adapters/googleAiStudio";
import { grokPremium } from "./adapters/grokPremium";
import type { UsageAdapter, UsageItem } from "./types";

export { AI_SERVICES, type AiService } from "./types";

/** 畫面顯示順序 = 這個陣列的順序 */
export const USAGE_ADAPTERS: UsageAdapter[] = [claudePro, geminiPro, grokPremium, googleAiStudio];

/** 每個 adapter 各自讀取;單一個失敗不影響其他(失敗的那張卡顯示無資料) */
export async function readAllUsage(items: UsageItem[], now: Date): Promise<AiUsage[]> {
  return Promise.all(
    USAGE_ADAPTERS.map(async (a) => {
      try {
        return await a.read({ items, now });
      } catch (e) {
        console.error(`[usage:${a.service}]`, e);
        return { service: a.service, usedPct: null, resetAt: null, source: a.mode, bot: "", asOf: null, note: "讀取失敗" };
      }
    }),
  );
}

export function adapterFor(service: string): UsageAdapter | undefined {
  return USAGE_ADAPTERS.find((a) => a.service === service);
}
