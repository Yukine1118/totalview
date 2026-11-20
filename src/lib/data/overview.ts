import "server-only";
import { demoOverview } from "@/lib/demo/overview";
import type { Overview } from "@/lib/types";

/**
 * 總覽頁資料來源(只在伺服器端執行)。
 * 目前(第 2 階段)全部是 DEMO;第 4 階段改為讀 Supabase,
 * 第 6 階段 GitHub 進度改讀 GitHub API。
 */
export async function getOverview(now: Date = new Date()): Promise<Overview> {
  return demoOverview(now);
}
