import { IMPORT_MAX_CHARS, parseImport } from "@/lib/import/parse";
import type { ImportItem } from "@/lib/import/schema";
import { itemsFingerprint } from "./canonical";
import { IngestNotReadyError } from "./errors";
import { bearerToken, tokenEquals } from "./token";

/**
 * POST /api/ingest 的判斷(純函式 + 注入的資料庫操作,方便測試)。
 *
 * 順序:
 * 1. 不是 POST → 405(即使 token 沒設定也一樣,GET 不寫入)
 * 2. INGEST_TOKEN 沒設定或是空白 → 503,完全不寫
 * 3. 沒帶或帶錯 Bearer token → 401(常數時間比較)
 * 4. 本文太長 → 413,不解析、不寫
 * 5. 格式不對 → 400,附行號,不寫
 * 6. 資料庫沒設定,或 migration 還沒套用 → 503,不寫
 * 7. 某個 bot 的內容和它最新一版相同 → 略過該 bot(不新增版本)
 * 8. 有變動的 bot 一次寫入,source 由資料庫函式 aiwr_ingest 記成 ingest
 *
 * 回應只有狀態與筆數,不含持股、原文或版本內容。
 */

export type IngestRequest = {
  method: string;
  authorization: string | null;
  body: string;
  /** Content-Length 原文字;沒有就 null */
  contentLengthHeader: string | null;
};

export type IngestEnv = { INGEST_TOKEN?: string };

export type IngestDeps = {
  dbConfigured: () => boolean;
  latestItems: (bot: string) => Promise<ImportItem[] | null>;
  write: (raw: string, items: ImportItem[]) => Promise<void>;
};

export type IngestResult = {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  /** 這次實際新增的 bot 數。不是 200 時為 0。 */
  written: number;
};

const HEADERS = { "cache-control": "no-store", allow: "POST" };

function result(status: number, body: Record<string, unknown>, written = 0): IngestResult {
  return { status, body, headers: HEADERS, written };
}

function contentTooLarge(header: string | null, body: string): boolean {
  if (header !== null) {
    if (!/^\d{1,7}$/.test(header)) return true;
    if (Number(header) > IMPORT_MAX_CHARS) return true;
  }
  return body.length > IMPORT_MAX_CHARS;
}

export async function handleIngest(req: IngestRequest, env: IngestEnv, deps: IngestDeps): Promise<IngestResult> {
  if (req.method !== "POST") return result(405, { error: "method_not_allowed" });

  const expected = env.INGEST_TOKEN?.trim() ?? "";
  if (!expected) return result(503, { error: "unavailable" });

  const provided = bearerToken(req.authorization);
  if (!provided || !tokenEquals(provided, expected)) return result(401, { error: "unauthorized" });

  if (contentTooLarge(req.contentLengthHeader, req.body)) return result(413, { error: "too_large" });

  const parsed = parseImport(req.body);
  if (!parsed.ok) {
    return result(400, {
      error: "invalid",
      issues: parsed.blocks.flatMap((b) =>
        b.issues.map((issue) => ({
          block: issue.block,
          line: issue.line,
          column: issue.column,
          path: issue.path,
          message: issue.message,
          ...(issue.bot ? { bot: issue.bot } : {}),
        })),
      ),
      global: parsed.globalIssues,
    });
  }

  if (!deps.dbConfigured()) return result(503, { error: "unavailable" });

  try {
    const pending: { items: ImportItem[]; report: NonNullable<(typeof parsed.blocks)[number]["report"]> }[] = [];
    let skipped = 0;
    for (const block of parsed.blocks) {
      if (!block.bot || !block.report) return result(400, { error: "invalid", issues: [], global: ["無法辨識 bot"] });
      const current = await deps.latestItems(block.bot);
      if (current && itemsFingerprint(current) === itemsFingerprint(block.items)) {
        skipped += 1;
        continue;
      }
      pending.push({ items: block.items, report: block.report });
    }

    if (pending.length === 0) return result(200, { ok: true, written: 0, skipped }, 0);

    const raw = JSON.stringify(
      pending.map((p) => p.report),
      null,
      2,
    );
    await deps.write(raw, pending.flatMap((p) => p.items));
    return result(200, { ok: true, written: pending.length, skipped }, pending.length);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // 只記短訊息,方便在 Vercel 日誌看出是不是還沒跑 migration;不記本文。
    console.error(`ingest failed: ${message.slice(0, 300)}`);
    if (e instanceof IngestNotReadyError) return result(503, { error: "ingest_not_ready" });
    return result(503, { error: "unavailable" });
  }
}
