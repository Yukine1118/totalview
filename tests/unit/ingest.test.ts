import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { itemsFingerprint } from "@/lib/ingest/canonical";
import { isIngestNotReadyMessage, IngestNotReadyError } from "@/lib/ingest/errors";
import { handleIngest, type IngestDeps } from "@/lib/ingest/handle";
import { IMPORT_MAX_CHARS, parseImport } from "@/lib/import/parse";
import type { ImportItem } from "@/lib/import/schema";
import { bearerToken, tokenEquals } from "@/lib/ingest/token";

const TOKEN = "unit-test-ingest-token";

const valid = JSON.stringify({
  schema: "aiwr/v1",
  bot: "demo-bot",
  generated_at: "2026-11-20T08:00:00+08:00",
  summary: { text: "DEMO", as_of: "2026-11-20T08:00:00+08:00" },
});

function deps(partial: Partial<IngestDeps> = {}): IngestDeps {
  return {
    dbConfigured: () => true,
    latestItems: async () => null,
    write: vi.fn(async () => {}),
    ...partial,
  };
}

function post(body: string, authorization: string | null = `Bearer ${TOKEN}`, contentLengthHeader: string | null = null) {
  return { method: "POST", authorization, body, contentLengthHeader };
}

describe("token", () => {
  it("只接受 Bearer,長度不同也比得出來", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(tokenEquals(TOKEN, TOKEN)).toBe(true);
    expect(tokenEquals("nope", TOKEN)).toBe(false);
    expect(tokenEquals("x", TOKEN)).toBe(false);
  });
});

describe("handleIngest", () => {
  it("GET 405,而且不會寫入", async () => {
    const d = deps();
    const res = await handleIngest({ method: "GET", authorization: `Bearer ${TOKEN}`, body: valid, contentLengthHeader: null }, { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(405);
    expect(res.body).toEqual({ error: "method_not_allowed" });
    expect(res.headers.allow).toBe("POST");
    expect(d.write).not.toHaveBeenCalled();
  });

  it("沒設定 token 時 POST 503,即使帶了 Bearer 也不寫", async () => {
    for (const env of [{}, { INGEST_TOKEN: "" }, { INGEST_TOKEN: "   " }]) {
      const d = deps();
      const res = await handleIngest(post(valid), env, d);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "unavailable" });
      expect(d.write).not.toHaveBeenCalled();
    }
  });

  it("沒帶 token 或帶錯 token 都是 401,不讀最新版本、不寫入", async () => {
    for (const authorization of [null, "", "Bearer", "Bearer wrong-token", "Basic " + TOKEN]) {
      const latestItems = vi.fn(async () => null);
      const d = deps({ latestItems });
      const res = await handleIngest(post(valid, authorization), { INGEST_TOKEN: TOKEN }, d);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
      expect(d.write).not.toHaveBeenCalled();
      expect(latestItems).not.toHaveBeenCalled();
    }
  });

  it("壞掉的 JSON 回 400 與行號,不寫入", async () => {
    const d = deps();
    const res = await handleIngest(post("{ \"schema\": \"aiwr/v1\", }"), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid");
    const issues = res.body.issues as { line: number; message: string }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].line).toBeGreaterThan(0);
    expect(issues[0].message.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain("payload");
    expect(d.write).not.toHaveBeenCalled();
  });

  it("通過 JSON 但沒有資料區塊也是 400,不寫入", async () => {
    const d = deps();
    const body = JSON.stringify({ schema: "aiwr/v1", bot: "x", generated_at: "2026-11-20T00:00:00Z" });
    const res = await handleIngest(post(body), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(400);
    const issues = res.body.issues as { message: string; line: number }[];
    expect(issues.some((i) => i.message.includes("至少要有一個資料區塊") && i.line > 0)).toBe(true);
    expect(d.write).not.toHaveBeenCalled();
  });

  it("本文超過上限回 413,不寫入", async () => {
    const d = deps();
    const res = await handleIngest(post("x".repeat(IMPORT_MAX_CHARS + 1)), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(413);
    expect(d.write).not.toHaveBeenCalled();

    const d2 = deps();
    const res2 = await handleIngest(post("", `Bearer ${TOKEN}`, String(IMPORT_MAX_CHARS + 1)), { INGEST_TOKEN: TOKEN }, d2);
    expect(res2.status).toBe(413);
    expect(d2.write).not.toHaveBeenCalled();
  });

  it("資料庫沒設定時,合法內容回 503 且不寫、不回內容", async () => {
    const d = deps({ dbConfigured: () => false });
    const res = await handleIngest(post(valid), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(res.body)).not.toContain("DEMO");
    expect(d.write).not.toHaveBeenCalled();
  });

  it("和最新版本相同就略過,不寫入", async () => {
    const items = parseImport(valid).blocks[0].items;
    const tweaked = structuredClone(items) as ImportItem[];
    const payload = tweaked[0].payload as { as_of: string };
    payload.as_of = new Date(payload.as_of).toISOString();
    tweaked[0].as_of = payload.as_of;
    expect(itemsFingerprint(tweaked)).toBe(itemsFingerprint(items));

    const d = deps({ latestItems: async () => tweaked });
    const res = await handleIngest(post(valid), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, written: 0, skipped: 1 });
    expect(d.write).not.toHaveBeenCalled();
  });

  it("內容不同才寫入,回應不含原文", async () => {
    const write = vi.fn<(raw: string, items: ImportItem[]) => Promise<void>>(async () => undefined);
    const d = deps({ write });
    const res = await handleIngest(post(valid), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, written: 1, skipped: 0 });
    expect(res.written).toBe(1);
    expect(write).toHaveBeenCalledOnce();
    const [raw, items] = write.mock.calls[0];
    expect(raw).toContain("demo-bot");
    expect(items).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("DEMO");
  });

  it("兩個 bot 只有變動的那個會寫入", async () => {
    const second = {
      schema: "aiwr/v1",
      bot: "other-bot",
      generated_at: "2026-11-20T08:00:00Z",
      summary: { text: "DEMO-2", as_of: "2026-11-20T08:00:00Z" },
    };
    const body = JSON.stringify([JSON.parse(valid), second]);
    const parsed = parseImport(body);
    const same = parsed.blocks[0].items;
    const write = vi.fn<(raw: string, items: ImportItem[]) => Promise<void>>(async () => undefined);
    const d = deps({
      write,
      latestItems: async (bot) => (bot === "demo-bot" ? same : null),
    });
    const res = await handleIngest(post(body), { INGEST_TOKEN: TOKEN }, d);
    expect(res.body).toEqual({ ok: true, written: 1, skipped: 1 });
    const items = write.mock.calls[0][1];
    expect(items.map((i) => i.bot)).toEqual(["other-bot"]);
  });

  it("migration 還沒跑時回 ingest_not_ready,不寫入", async () => {
    const d = deps({
      latestItems: async () => {
        throw new IngestNotReadyError("Could not find the function public.aiwr_latest_bot_items");
      },
    });
    const res = await handleIngest(post(valid), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "ingest_not_ready" });
    expect(d.write).not.toHaveBeenCalled();
  });

  it("寫入時撞到 source 檢查也是 ingest_not_ready", async () => {
    const d = deps({
      write: async () => {
        throw new IngestNotReadyError('new row for relation "aiwr_imports" violates check constraint "aiwr_imports_source_check"');
      },
    });
    const res = await handleIngest(post(valid), { INGEST_TOKEN: TOKEN }, d);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "ingest_not_ready" });
  });
});

describe("isIngestNotReadyMessage", () => {
  it("認得出函式不存在與 check constraint", () => {
    expect(isIngestNotReadyMessage("PGRST202 Could not find the function public.aiwr_ingest")).toBe(true);
    expect(isIngestNotReadyMessage("violates check constraint")).toBe(true);
    expect(isIngestNotReadyMessage("connection refused")).toBe(false);
  });
});

describe("migration 0003", () => {
  const sql = readFileSync(path.join(__dirname, "../../supabase/migrations/0003_aiwr_ingest_source.sql"), "utf8");

  it("放行 ingest、新增寫入函式,而且不刪資料", () => {
    expect(sql).toContain("'paste', 'restore', 'ingest'");
    expect(sql).toContain("function public.aiwr_ingest");
    expect(sql).toContain("function public.aiwr_latest_bot_items");
    expect(sql).toContain("values ('ingest', p_raw)");
    expect(sql).toContain("grant execute on function public.aiwr_ingest(text, jsonb) to service_role");
    expect(sql).toContain("revoke all on function public.aiwr_ingest(text, jsonb) from public, anon, authenticated");
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql).not.toContain("aiwr_import(");
  });
});
