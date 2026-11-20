import "server-only";
import { fetchCurrentItems, fetchEquityHistory, isDbConfigured } from "@/lib/db";
import { demoPortfolio } from "@/lib/demo/portfolio";
import { botsForAccount, toEquitySeries, toFx, toPositions, toStrategies, toSummaries } from "@/lib/data/fromItems";
import type { Account, Portfolio } from "@/lib/types";

/**
 * 部位頁資料來源(只在伺服器端執行)。
 * 有設定資料庫 → 只用真實資料;沒設定 → DEMO。
 */
export async function getPortfolio(account: Account, now: Date = new Date()): Promise<Portfolio> {
  if (!isDbConfigured()) return demoPortfolio(account, now);

  const [current, history] = await Promise.all([fetchCurrentItems(), fetchEquityHistory()]);
  const bots = botsForAccount(current, history, account);
  const real = <T,>(data: T) => ({ isDemo: false, data });
  return {
    account,
    positions: real(toPositions(current, account)),
    equity: real(toEquitySeries(history, account)),
    summaries: real(toSummaries(current, bots)),
    fx: real(toFx(current)),
    strategies: account === "paper" ? real(toStrategies(current)) : undefined,
  };
}
