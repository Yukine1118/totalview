import "server-only";
import { demoPortfolio } from "@/lib/demo/portfolio";
import type { Account, Portfolio } from "@/lib/types";

/**
 * 部位頁資料來源(只在伺服器端執行)。
 * 第 3 階段:DEMO。第 4 階段改讀 Supabase(依 account 分開查)。
 */
export async function getPortfolio(account: Account, now: Date = new Date()): Promise<Portfolio> {
  return demoPortfolio(account, now);
}
