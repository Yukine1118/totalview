import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseImport } from "@/lib/import/parse";

const twoBots = readFileSync(path.join(__dirname, "../fixtures/two-bots.txt"), "utf8");

describe("parseImport:正常", () => {
  it("從混著文字的內容中找出兩個 bot,並辨識 bot 名稱", () => {
    const r = parseImport(twoBots);
    expect(r.globalIssues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.blocks.map((b) => b.bot)).toEqual(["台股模擬交易室", "幣圈情報員"]);
  });

  it("拆成正確的資料筆數與種類", () => {
    const r = parseImport(twoBots);
    expect(r.blocks[0].items.map((i) => i.kind)).toEqual(["bot_status", "positions_paper", "equity", "strategies", "summary"]);
    expect(r.blocks[1].items.map((i) => `${i.kind}:${i.key}`)).toEqual(["bot_status:", "fx:USDT/TWD"]);
  });

  it("沒有標記時,整段 JSON 陣列也可以", () => {
    const one = { schema: "aiwr/v1", bot: "a", generated_at: "2026-11-20T08:00:00Z", summary: { text: "x", as_of: "2026-11-20T08:00:00Z" } };
    const r = parseImport(JSON.stringify([one, { ...one, bot: "b" }], null, 2));
    expect(r.ok).toBe(true);
    expect(r.blocks.map((b) => b.bot)).toEqual(["a", "b"]);
  });
});

describe("parseImport:錯誤要指出第幾行", () => {
  it("JSON 語法錯誤(少逗號)", () => {
    const text = twoBots.replace('"note": "收盤後帳本已更新",', '"note": "收盤後帳本已更新"');
    const r = parseImport(text);
    expect(r.ok).toBe(false);
    const issue = r.blocks[0].issues[0];
    expect(issue.message).toContain("逗號");
    // 原文第 12 行是 "as_of"(缺逗號後的下一個欄位)
    expect(issue.line).toBe(12);
  });

  it("數字加了單位 → 指出欄位與行號", () => {
    const text = twoBots.replace('"qty": 3000', '"qty": "3000股"');
    const r = parseImport(text);
    const issue = r.blocks[0].issues[0];
    expect(issue.path).toBe("positions[0].items[0].qty");
    expect(issue.message).toContain("數字");
    expect(issue.line).toBe(19);
  });

  it("時間沒有時區", () => {
    const text = twoBots.replace('"generated_at": "2026-11-20T08:10:00+08:00"', '"generated_at": "2026-11-20 08:10"');
    const r = parseImport(text);
    expect(r.blocks[1].issues[0].path).toBe("generated_at");
    expect(r.blocks[1].issues[0].message).toContain("時區");
    expect(r.blocks[1].issues[0].line).toBe(43);
  });

  it("缺少必填欄位、拼錯欄位", () => {
    const text = twoBots.replace('"symbol": "2317", ', "").replace('"cash": 280000', '"cassh": 280000');
    const msgs = parseImport(text).blocks[0].issues.map((i) => `${i.path}:${i.message}`);
    expect(msgs).toContain("positions[0].items[0].symbol:缺少這個必填欄位");
    expect(msgs.some((m) => m.includes("cassh"))).toBe(true);
  });

  it("用了全形引號", () => {
    const r = parseImport('{ “schema”: "aiwr/v1" }');
    expect(r.blocks[0].issues[0].message).toContain("雙引號");
  });

  it("同一個 bot 貼兩次", () => {
    const text = twoBots.replace('"bot": "幣圈情報員"', '"bot": "台股模擬交易室"');
    expect(parseImport(text).globalIssues[0]).toContain("台股模擬交易室");
  });

  it("標記沒有成對", () => {
    expect(parseImport("===AIWR-BEGIN===\n{}").globalIssues[0]).toContain("缺少");
  });

  it("什麼都沒貼", () => {
    expect(parseImport("   ").ok).toBe(false);
  });

  it("只有 bot 沒有任何資料區塊", () => {
    const r = parseImport(JSON.stringify({ schema: "aiwr/v1", bot: "a", generated_at: "2026-11-20T08:00:00Z" }));
    expect(r.blocks[0].issues[0].message).toContain("至少要有一個資料區塊");
  });
});

describe("格式說明文件裡的範例一定要能匯入", () => {
  const doc = readFileSync(path.join(__dirname, "../../docs/grok-output-format.md"), "utf8");
  it("docs/grok-output-format.md 的所有範例段落都通過檢查", () => {
    // 說明文件把同一個 bot 的範例寫在兩處(指令段落 + 完整範例),分開檢查
    const parts = doc.split("## 完整範例");
    for (const part of parts) {
      const r = parseImport(part);
      const problems = [...r.globalIssues, ...r.blocks.flatMap((b) => b.issues.map((i) => `${b.bot} 第${i.line}行 ${i.path} ${i.message}`))];
      expect(problems).toEqual([]);
      expect(r.blocks.length).toBeGreaterThan(0);
    }
  });
});
