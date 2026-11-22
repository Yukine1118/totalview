import { describe, expect, it } from "vitest";
import { parseImport } from "@/lib/import/parse";
import { readAllUsage, USAGE_ADAPTERS } from "@/lib/usage";
import { buildManualUsageReport, isoToTaipeiLocal, toTaipeiIso } from "@/lib/usage/manualReport";

describe("usage adapters", () => {
  it("四個服務各一個 adapter,順序固定", () => {
    expect(USAGE_ADAPTERS.map((a) => a.service)).toEqual(["Claude Pro", "Gemini Pro", "Grok Premium", "Google AI Studio"]);
    expect(USAGE_ADAPTERS.every((a) => a.whereToCheck.length > 0)).toBe(true);
  });

  it("沒有匯入過 → 全部無資料(不猜)", async () => {
    const u = await readAllUsage([], new Date());
    expect(u.every((x) => x.usedPct === null && x.asOf === null)).toBe(true);
  });
});

describe("手動更新表單 → JSON", () => {
  const now = new Date("2026-11-22T06:30:00Z");

  it("時間轉成台北時間並帶時區", () => {
    expect(toTaipeiIso(now)).toBe("2026-11-22T14:30:00+08:00");
    expect(isoToTaipeiLocal("2026-11-22T06:30:00Z")).toBe("2026-11-22T14:30");
    expect(isoToTaipeiLocal(null)).toBe("");
  });

  it("產生的內容可以通過匯入檢查,數值正確", async () => {
    const text = buildManualUsageReport(
      [
        { service: "Claude Pro", usedPct: 42.5, resetLocal: "2026-11-23T03:00", note: " 備註 " },
        { service: "Grok Premium", usedPct: null, resetLocal: "", note: "" },
      ],
      now,
    );
    const r = parseImport(text);
    expect(r.ok).toBe(true);
    const items = r.blocks[0].items;
    expect(items.map((i) => i.key)).toEqual(["Claude Pro", "Grok Premium"]);
    const usage = await readAllUsage(items, now);
    expect(usage[0]).toMatchObject({ usedPct: 42.5, resetAt: "2026-11-23T03:00:00+08:00", note: "備註", asOf: "2026-11-22T14:30:00+08:00" });
    expect(usage[2].usedPct).toBeNull();
    expect(usage[1].asOf).toBeNull(); // Gemini 沒填 → 無資料
  });
});
