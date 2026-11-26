import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fetchLatestBotItems, insertIngest, isDbConfigured } from "@/lib/db";
import { handleIngest } from "@/lib/ingest/handle";
import { IMPORT_MAX_CHARS } from "@/lib/import/parse";
import type { ImportItem } from "@/lib/import/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 給本機上傳腳本用的寫入端點。不看 GitHub 登入(middleware 只放行這一個路徑),
 * 只認 Authorization: Bearer <INGEST_TOKEN>。
 * 成功時只回傳寫了幾個 bot,不回傳庫裡的資料。
 */

const deps = {
  dbConfigured: isDbConfigured,
  latestItems: fetchLatestBotItems,
  write: async (raw: string, items: ImportItem[]) => {
    await insertIngest(raw, items);
  },
};

function headerSaysTooLarge(header: string | null): boolean {
  if (header === null) return false;
  if (!/^\d{1,7}$/.test(header)) return true;
  return Number(header) > IMPORT_MAX_CHARS;
}

function readIngestToken(): string | undefined {
  // 動態讀取,避免 Next 在 build 時把 process.env.INGEST_TOKEN 寫死。
  // 同一份 build 才能在執行時看到 Vercel 或測試程序設定的值。
  return process.env["INGEST_TOKEN"];
}

async function run(req: Request) {
  const contentLengthHeader = req.headers.get("content-length");
  // Content-Length 已經超過上限就不要把本文讀進記憶體。
  const body = req.method === "POST" && !headerSaysTooLarge(contentLengthHeader) ? await req.text() : "";
  const result = await handleIngest(
    {
      method: req.method,
      authorization: req.headers.get("authorization"),
      body,
      contentLengthHeader,
    },
    { INGEST_TOKEN: readIngestToken() },
    deps,
  );
  if (result.written > 0) revalidatePath("/", "layout");
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
export const HEAD = run;
export const OPTIONS = run;
