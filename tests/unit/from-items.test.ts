import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  botsForAccount,
  toAiUsage,
  toBotStatuses,
  toEquitySeries,
  toFx,
  toPositions,
  toStrategies,
  toSummaries,
} from "@/lib/data/fromItems";
import { parseImport } from "@/lib/import/parse";

const items = parseImport(readFileSync(path.join(__dirname, "../fixtures/two-bots.txt"), "utf8")).blocks.flatMap((b) => b.items);

describe("fromItems", () => {
  it("AI 用量:四個服務一定都在,沒資料的是 null(不補)", () => {
    const u = toAiUsage(items);
    expect(u.map((x) => x.service)).toEqual(["Claude Pro", "Gemini Pro", "Grok Premium", "Google AI Studio"]);
    expect(u.every((x) => x.usedPct === null && x.asOf === null)).toBe(true);
  });

  it("AI 用量:多個來源時取資料時間最新的", () => {
    const mk = (bot: string, pct: number, at: string) => ({
      bot, kind: "ai_usage", key: "Claude Pro", as_of: at,
      payload: { service: "Claude Pro", used_pct: pct, source: "manual", as_of: at },
    });
    const u = toAiUsage([mk("a", 10, "2026-11-20T01:00:00Z"), mk("b", 50, "2026-11-20T05:00:00Z")]);
    expect(u[0].usedPct).toBe(50);
    expect(u[0].bot).toBe("b");
  });

  it("bot 狀態", () => {
    const s = toBotStatuses(items);
    expect(s.map((x) => `${x.bot}:${x.status}`).sort()).toEqual(["台股模擬交易室:ok", "幣圈情報員:warn"]);
  });

  it("持股依帳戶分開", () => {
    expect(toPositions(items, "paper")).toHaveLength(1);
    expect(toPositions(items, "real")).toHaveLength(0);
    expect(toPositions(items, "paper")[0]).toMatchObject({ symbol: "2317", avgCost: 205, lastPrice: 212.5, currency: "TWD" });
  });

  it("資產曲線:同時間點重複以後者為準,依時間排序", () => {
    const e = (equity: number, at: string) => ({
      bot: "x", kind: "equity", key: "paper|TW|TWD", as_of: at,
      payload: { account: "paper", market: "TW", currency: "TWD", equity, cash: 1, as_of: at },
    });
    const s = toEquitySeries([e(100, "2026-11-19T05:30:00Z"), e(90, "2026-11-18T05:30:00Z"), e(105, "2026-11-19T05:30:00Z")], "paper");
    expect(s).toHaveLength(1);
    expect(s[0].points.map((p) => p.equity)).toEqual([90, 105]);
    expect(toEquitySeries([e(1, "2026-11-19T05:30:00Z")], "real")).toHaveLength(0);
  });

  it("策略、摘要、匯率", () => {
    expect(toStrategies(items)[0]).toMatchObject({ name: "趨勢均線", oosReturnPct: null, trades: 12 });
    const bots = botsForAccount(items, items, "paper");
    expect([...bots]).toEqual(["台股模擬交易室"]);
    expect(toSummaries(items, bots)).toHaveLength(1);
    expect(toFx(items)).toEqual([{ base: "USDT", quote: "TWD", rate: 32.1, asOf: "2026-11-20T08:00:00+08:00", source: "交易所報價" }]);
  });
});
