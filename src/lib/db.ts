import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IngestNotReadyError, isIngestNotReadyMessage } from "@/lib/ingest/errors";
import type { ImportItem } from "@/lib/import/schema";

/**
 * 資料庫存取(只在伺服器端)。
 * 使用 secret / service role key:權限很大,所以只能在這裡用,絕不可傳到瀏覽器。
 * 環境變數沒設定時 isDbConfigured() = false,網站改顯示 DEMO(本機開發與 E2E 測試用)。
 */

export function isDbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!isDbConfigured()) throw new Error("資料庫尚未設定(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export type StoredItem = ImportItem & { import_id: string; imported_at?: string };

/** 每個 (bot, kind, key) 目前有效的一筆 */
export async function fetchCurrentItems(): Promise<StoredItem[]> {
  const { data, error } = await db().from("aiwr_current").select("import_id, bot, kind, key, as_of, payload, imported_at");
  if (error) throw new Error(`讀取資料失敗:${error.message}`);
  return (data ?? []) as StoredItem[];
}

/** 資產快照的歷史(畫資產曲線用),排除已被還原掉的 */
export async function fetchEquityHistory(sinceDays = 400): Promise<StoredItem[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("aiwr_items")
    .select("import_id, bot, kind, key, as_of, payload")
    .eq("kind", "equity")
    .is("reverted_at", null)
    .gte("as_of", since)
    .order("as_of", { ascending: true })
    .order("id", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`讀取資產曲線失敗:${error.message}`);
  return (data ?? []) as StoredItem[];
}

export async function insertImport(raw: string, items: ImportItem[]): Promise<string> {
  const { data, error } = await db().rpc("aiwr_import", { p_raw: raw, p_items: items });
  if (error) throw new Error(`寫入失敗:${error.message}`);
  return data as string;
}

/**
 * 自動匯入。走獨立函式 aiwr_ingest,來源記成 ingest。
 * 函式不存在或 source 檢查還沒放行時,丟 IngestNotReadyError(呼叫端回 503、不寫入)。
 */
export async function insertIngest(raw: string, items: ImportItem[]): Promise<string> {
  const { data, error } = await db().rpc("aiwr_ingest", { p_raw: raw, p_items: items });
  if (error) {
    const detail = `${error.code ?? ""} ${error.message}`;
    if (isIngestNotReadyMessage(detail)) throw new IngestNotReadyError(error.message);
    throw new Error(`寫入失敗:${error.message}`);
  }
  return data as string;
}

/** 這個 bot 最新一個版本裡的 items;還沒有版本就 null。migration 未套用時丟 IngestNotReadyError。 */
export async function fetchLatestBotItems(bot: string): Promise<ImportItem[] | null> {
  const { data, error } = await db().rpc("aiwr_latest_bot_items", { p_bot: bot });
  if (error) {
    const detail = `${error.code ?? ""} ${error.message}`;
    if (isIngestNotReadyMessage(detail)) throw new IngestNotReadyError(error.message);
    throw new Error(`讀取最新版本失敗:${error.message}`);
  }
  const items = (data ?? []) as ImportItem[];
  return items.length ? items : null;
}

export async function restoreImport(importId: string): Promise<string> {
  const { data, error } = await db().rpc("aiwr_restore", { p_import: importId });
  if (error) throw new Error(`還原失敗:${error.message}`);
  return data as string;
}

export type ImportSummary = {
  id: string;
  created_at: string;
  source: "paste" | "restore" | "ingest";
  note: string | null;
  restored_from: string | null;
  items: { bot: string; kind: string; as_of: string; reverted_at: string | null }[];
};

export async function listImports(limit = 50): Promise<ImportSummary[]> {
  const { data, error } = await db()
    .from("aiwr_imports")
    .select("id, created_at, source, note, restored_from, items:aiwr_items!aiwr_items_import_id_fkey(bot, kind, as_of, reverted_at)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`讀取歷史失敗:${error.message}`);
  return (data ?? []) as unknown as ImportSummary[];
}

export async function getImport(id: string): Promise<(ImportSummary & { raw_text: string; itemsFull: StoredItem[] }) | null> {
  const { data, error } = await db()
    .from("aiwr_imports")
    .select("id, created_at, source, note, restored_from, raw_text, items:aiwr_items!aiwr_items_import_id_fkey(bot, kind, key, as_of, payload, reverted_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取版本失敗:${error.message}`);
  if (!data) return null;
  const d = data as unknown as ImportSummary & { raw_text: string; items: (StoredItem & { reverted_at: string | null })[] };
  return { ...d, itemsFull: d.items };
}
