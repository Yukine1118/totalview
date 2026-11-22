import { describe, expect, it } from "vitest";
import { BLOCKS, buildInstruction, validateBotName, type BlockId } from "@/lib/import/instructions";
import { parseImport } from "@/lib/import/parse";

const ids = BLOCKS.map((b) => b.id);

/** 所有非空的區塊組合(2^9 - 1 = 511 種) */
function* combos(): Generator<BlockId[]> {
  for (let mask = 1; mask < 1 << ids.length; mask++) yield ids.filter((_, i) => mask & (1 << i));
}

describe("buildInstruction", () => {
  it("每一種區塊組合 × 兩種市場,產生的範例都能通過匯入檢查,且 bot 名稱正確", () => {
    let n = 0;
    for (const blocks of combos()) {
      for (const market of ["TW", "CRYPTO"] as const) {
        const text = buildInstruction({ bot: "台股模擬交易室", blocks, market });
        const r = parseImport(text);
        const problems = [...r.globalIssues, ...r.blocks.flatMap((b) => b.issues.map((i) => `${i.path} ${i.message}`))];
        expect(problems, `${blocks.join(",")} ${market}`).toEqual([]);
        expect(r.blocks).toHaveLength(1);
        expect(r.blocks[0].bot).toBe("台股模擬交易室");
        n++;
      }
    }
    expect(n).toBe(1022);
  });

  it("只列出勾選區塊的規則", () => {
    const text = buildInstruction({ bot: "x", blocks: ["summary"], market: "TW" });
    expect(text).toContain("- summary");
    expect(text).not.toContain("- bot_status");
  });
});

describe("validateBotName", () => {
  it("擋掉空白、過長、有引號的名稱", () => {
    expect(validateBotName("")).not.toBeNull();
    expect(validateBotName("a".repeat(65))).not.toBeNull();
    expect(validateBotName('ab"c')).not.toBeNull();
    expect(validateBotName("幣圈情報員")).toBeNull();
  });
});
