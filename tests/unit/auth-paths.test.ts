import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLoginExempt } from "@/lib/auth-paths";

describe("isLoginExempt", () => {
  it("只放行登入流程與精確的 /api/ingest", () => {
    expect(isLoginExempt("/login")).toBe(true);
    expect(isLoginExempt("/api/auth/callback/github")).toBe(true);
    expect(isLoginExempt("/api/auth/")).toBe(true);
    expect(isLoginExempt("/api/ingest")).toBe(true);
  });

  it("相近路徑與其他 API 仍要登入", () => {
    for (const path of [
      "/api/ingest/",
      "/api/ingest/extra",
      "/api/ingests",
      "/api/ingestx",
      "/api/me",
      "/api/anything",
      "/api/auth",
      "/login/extra",
      "/",
      "/import",
    ]) {
      expect(isLoginExempt(path), path).toBe(false);
    }
  });

  it("middleware 只透過這個函式放行,沒有把 /api/ingest 開成前綴", () => {
    const src = readFileSync(path.join(__dirname, "../../src/middleware.ts"), "utf8");
    expect(src).toContain("isLoginExempt(pathname)");
    expect(src).not.toContain('startsWith("/api/ingest")');
    // "/api/" 只出現在「未登入的 API 回 401」那一行,不是放行範圍。
    expect(src).toContain('pathname.startsWith("/api/")');
  });
});
