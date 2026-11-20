import { describe, expect, it } from "vitest";
import { evaluateFreshness, formatAgo, formatTaipei } from "@/lib/freshness";
import type { FreshnessRule } from "@/config/freshness";

const TW: FreshnessRule = { kind: "tw_close", closeHHMM: "13:30", dueHHMM: "18:00" };
const CRYPTO: FreshnessRule = { kind: "utc_daily", graceHours: 6 };
const INTERVAL: FreshnessRule = { kind: "interval", maxAgeMin: 100 };

// 台北時間 → Date 的小工具
const tpe = (s: string) => new Date(`${s}+08:00`);

describe("無資料", () => {
  it("null / 空字串 / 亂碼 都是 none", () => {
    expect(evaluateFreshness(null, INTERVAL).state).toBe("none");
    expect(evaluateFreshness("", INTERVAL).state).toBe("none");
    expect(evaluateFreshness("not-a-date", INTERVAL).state).toBe("none");
  });
});

describe("interval", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  it("未超過 80% → fresh", () => {
    expect(evaluateFreshness("2026-11-20T11:00:00Z", INTERVAL, now).state).toBe("fresh");
  });
  it("超過 80% → warn", () => {
    expect(evaluateFreshness("2026-11-20T10:30:00Z", INTERVAL, now).state).toBe("warn");
  });
  it("超過上限 → stale", () => {
    expect(evaluateFreshness("2026-11-20T10:00:00Z", INTERVAL, now).state).toBe("stale");
  });
});

describe("台股盤後 tw_close", () => {
  // 2026-11-20 是週五
  it("週五 18:00 前,有週四收盤後的資料 → fresh", () => {
    expect(evaluateFreshness(tpe("2026-11-19T15:00:00"), TW, tpe("2026-11-20T17:00:00")).state).toBe("fresh");
  });
  it("週五 18:00 後,還是週四的資料 → stale", () => {
    expect(evaluateFreshness(tpe("2026-11-19T15:00:00"), TW, tpe("2026-11-20T18:30:00")).state).toBe("stale");
  });
  it("週五 18:00 後,有週五 13:30 後的資料 → fresh", () => {
    expect(evaluateFreshness(tpe("2026-11-20T14:00:00"), TW, tpe("2026-11-20T18:30:00")).state).toBe("fresh");
  });
  it("週日看週五收盤資料 → fresh(週末不開盤)", () => {
    expect(evaluateFreshness(tpe("2026-11-20T15:00:00"), TW, tpe("2026-11-22T20:00:00")).state).toBe("fresh");
  });
  it("週一 18:00 後還是週五的資料 → stale", () => {
    expect(evaluateFreshness(tpe("2026-11-20T15:00:00"), TW, tpe("2026-11-23T18:30:00")).state).toBe("stale");
  });
  it("週一是休市日 → 週五資料仍 fresh", () => {
    expect(
      evaluateFreshness(tpe("2026-11-20T15:00:00"), TW, tpe("2026-11-23T18:30:00"), ["2026-11-23"]).state,
    ).toBe("fresh");
  });
});

describe("加密貨幣日線 utc_daily", () => {
  it("收線後寬限期內,前一天的資料 → fresh", () => {
    expect(evaluateFreshness("2026-11-19T01:00:00Z", CRYPTO, new Date("2026-11-20T03:00:00Z")).state).toBe("fresh");
  });
  it("寬限期過後,還是收線前的資料 → stale", () => {
    expect(evaluateFreshness("2026-11-19T23:00:00Z", CRYPTO, new Date("2026-11-20T07:00:00Z")).state).toBe("stale");
  });
  it("寬限期過後,有收線後的資料 → fresh", () => {
    expect(evaluateFreshness("2026-11-20T00:30:00Z", CRYPTO, new Date("2026-11-20T07:00:00Z")).state).toBe("fresh");
  });
});

describe("顯示格式", () => {
  it("台北時間", () => {
    expect(formatTaipei(new Date("2026-11-19T06:35:00Z"))).toBe("11/19 14:35");
  });
  it("多久以前", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(formatAgo(new Date("2026-11-20T11:59:30Z"), now)).toBe("剛剛");
    expect(formatAgo(new Date("2026-11-20T11:55:00Z"), now)).toBe("5 分鐘前");
    expect(formatAgo(new Date("2026-11-20T09:00:00Z"), now)).toBe("3 小時前");
    expect(formatAgo(new Date("2026-11-17T12:00:00Z"), now)).toBe("3 天前");
  });
});
