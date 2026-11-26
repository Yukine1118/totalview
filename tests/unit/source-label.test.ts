import { describe, expect, it } from "vitest";
import { importSourceLabel } from "@/lib/import/sourceLabel";

describe("importSourceLabel", () => {
  it("三種來源都有中文標籤", () => {
    expect(importSourceLabel("paste")).toBe("貼上");
    expect(importSourceLabel("restore")).toBe("還原");
    expect(importSourceLabel("ingest")).toBe("自動匯入");
  });

  it("不認得的來源不假裝成貼上", () => {
    expect(importSourceLabel("demo")).toBe("demo");
  });
});
