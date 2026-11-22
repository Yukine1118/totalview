import "server-only";
import { fetchCurrentItems, isDbConfigured } from "@/lib/db";
import { demoOverview } from "@/lib/demo/overview";
import { toBotStatuses } from "@/lib/data/fromItems";
import { readAllUsage } from "@/lib/usage";
import { getGithubSection } from "@/lib/data/github";
import type { Overview } from "@/lib/types";

/**
 * 總覽頁資料來源(只在伺服器端執行)。
 * - 有設定資料庫:只顯示真實資料,沒有就是「無資料」(不會混入 DEMO)。
 * - 沒設定資料庫(本機開發、E2E 測試):全部 DEMO。
 * - GitHub 工作進度:另外讀 GitHub(見 lib/data/github.ts),和資料庫無關。
 */
export async function getOverview(now: Date = new Date()): Promise<Overview> {
  const github = await getGithubSection(now);
  if (!isDbConfigured()) return { ...demoOverview(now), github };

  const items = await fetchCurrentItems();
  return {
    aiUsage: { isDemo: false, data: await readAllUsage(items, now) },
    bots: { isDemo: false, data: toBotStatuses(items) },
    github,
  };
}
