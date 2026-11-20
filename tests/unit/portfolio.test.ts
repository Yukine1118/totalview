import { describe, expect, it } from "vitest";
import { calcPosition, convert, fmtMoney, fmtPct, maxDrawdownPct, totalsByCurrency } from "@/lib/portfolio";
import type { FxRate, Position } from "@/lib/types";

const base: Position = {
  bot: "t", account: "real", market: "TW", symbol: "X", qty: 1000, avgCost: 100,
  lastPrice: 110, currency: "TWD", priceAsOf: null, asOf: null,
};

describe("calcPosition", () => {
  it("算出市值與未實現損益", () => {
    expect(calcPosition(base)).toEqual({ cost: 100000, marketValue: 110000, unrealized: 10000, unrealizedPct: 10 });
  });
  it("沒有現價 → 市值與損益為 null(不猜)", () => {
    const c = calcPosition({ ...base, lastPrice: null });
    expect(c.marketValue).toBeNull();
    expect(c.unrealized).toBeNull();
  });
});

describe("totalsByCurrency", () => {
  it("不同幣別分開加總,沒現價的另外計數", () => {
    const t = totalsByCurrency([
      base,
      { ...base, symbol: "Y", lastPrice: 90 },
      { ...base, symbol: "Z", lastPrice: null },
      { ...base, market: "CRYPTO", symbol: "BTC", qty: 0.5, avgCost: 60000, lastPrice: 70000, currency: "USDT" },
    ]);
    const twd = t.find((x) => x.currency === "TWD")!;
    expect(twd.marketValue).toBe(200000);
    expect(twd.unrealized).toBe(0);
    expect(twd.missingPrice).toBe(1);
    expect(t.find((x) => x.currency === "USDT")!.unrealized).toBe(5000);
  });
});

describe("convert", () => {
  const rates: FxRate[] = [{ base: "USD", quote: "TWD", rate: 32, asOf: null, source: "t" }];
  it("有匯率才換算,也支援反向", () => {
    expect(convert(10, "USD", "TWD", rates)).toBe(320);
    expect(convert(320, "TWD", "USD", rates)).toBe(10);
    expect(convert(5, "TWD", "TWD", rates)).toBe(5);
  });
  it("沒有匯率 → null(USDT 不會被當成 USD)", () => {
    expect(convert(10, "USDT", "TWD", rates)).toBeNull();
  });
});

describe("maxDrawdownPct", () => {
  it("找出最大跌幅", () => {
    expect(maxDrawdownPct([100, 120, 90, 130])).toBeCloseTo(-25);
    expect(maxDrawdownPct([100])).toBeNull();
  });
});

describe("格式", () => {
  it("台幣不顯示小數,其他兩位", () => {
    expect(fmtMoney(1234567.8, "TWD")).toBe("1,234,568");
    expect(fmtMoney(1234.5, "USDT")).toBe("1,234.50");
    expect(fmtPct(3.456)).toBe("+3.46%");
    expect(fmtPct(null)).toBe("—");
  });
});

describe("fmtPrice", () => {
  it("台幣單價保留小數,不四捨五入成整數", async () => {
    const { fmtPrice } = await import("@/lib/portfolio");
    expect(fmtPrice(180.5, "TWD")).toBe("180.5");
    expect(fmtPrice(985, "TWD")).toBe("985");
    expect(fmtPrice(0.000123, "USDT")).toBe("0.000123");
  });
});
