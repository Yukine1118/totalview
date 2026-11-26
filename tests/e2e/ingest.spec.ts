import { expect, test } from "@playwright/test";
import { E2E_INGEST_TOKEN } from "../../playwright.config";

test.describe("POST /api/ingest", () => {
  test.beforeEach(({}, testInfo) => {
    if (testInfo.project.name !== "desktop") test.skip();
  });

  test("GET 405(middleware 有放行,才不會先被登入擋成 401)", async ({ request }) => {
    const res = await request.get("/api/ingest", { maxRedirects: 0 });
    expect(res.status()).toBe(405);
    expect(res.headers().allow).toBe("POST");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  test("沒帶 token 回 401", async ({ request }) => {
    const res = await request.post("/api/ingest", { data: { hello: "nope" } });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("錯誤 token 回 401", async ({ request }) => {
    const res = await request.post("/api/ingest", {
      data: { hello: "nope" },
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("Bearer 不能拿來打開其他 API", async ({ request }) => {
    const res = await request.get("/api/me", {
      headers: { authorization: `Bearer ${E2E_INGEST_TOKEN}` },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("壞 JSON 回 400 與行號,而且沒有寫入(沒資料庫時若先寫會變成 503)", async ({ request }) => {
    const marker = "MARKER_SHOULD_NOT_ECHO_OR_STORE";
    const res = await request.post("/api/ingest", {
      headers: { authorization: `Bearer ${E2E_INGEST_TOKEN}`, "content-type": "application/json" },
      data: `{\n  "schema": "aiwr/v1",\n  "note": "${marker}"\n`,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid");
    const issues = body.issues as { line: number; message: string }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].line).toBeGreaterThan(0);
    expect(issues[0].message.length).toBeGreaterThan(0);
    const text = JSON.stringify(body);
    expect(text).not.toContain(marker);
    expect(text).not.toContain("payload");
  });

  test("合法 JSON 在沒有資料庫時回 503,不回傳內容", async ({ request }) => {
    const marker = "MARKER_SHOULD_NOT_ECHO";
    const res = await request.post("/api/ingest", {
      headers: { authorization: `Bearer ${E2E_INGEST_TOKEN}` },
      data: {
        schema: "aiwr/v1",
        bot: "e2e",
        generated_at: "2026-11-20T00:00:00Z",
        summary: { text: marker, as_of: "2026-11-20T00:00:00Z" },
      },
    });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain(marker);
  });

  test("沒設定 INGEST_TOKEN 時 POST 回 503,不接受寫入", async ({ request }) => {
    const res = await request.post("http://127.0.0.1:3101/api/ingest", {
      headers: { authorization: `Bearer ${E2E_INGEST_TOKEN}` },
      data: {
        schema: "aiwr/v1",
        bot: "e2e",
        generated_at: "2026-11-20T00:00:00Z",
        summary: { text: "nope", as_of: "2026-11-20T00:00:00Z" },
      },
    });
    expect(res.status()).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
