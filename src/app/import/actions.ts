"use server";

import { revalidatePath } from "next/cache";
import { getAllowedSession } from "@/auth";
import { fetchCurrentItems, insertImport, isDbConfigured, restoreImport } from "@/lib/db";
import { parseImport, type ParseIssue } from "@/lib/import/parse";
import { KIND_LABEL, type ImportItem } from "@/lib/import/schema";

export type PreviewRow = {
  kind: ImportItem["kind"];
  kindLabel: string;
  key: string;
  asOf: string;
  /** new = 第一次出現;update = 取代較舊的資料;older = 比目前資料還舊(仍可匯入,但會變成目前資料) */
  change: "new" | "update" | "older" | "history";
  currentAsOf?: string;
  count?: number;
};

export type PreviewBlock = { index: number; bot?: string; startLine: number; issues: ParseIssue[]; rows: PreviewRow[] };

export type PreviewResult = {
  ok: boolean;
  dbReady: boolean;
  globalIssues: string[];
  blocks: PreviewBlock[];
};

async function requireSession() {
  const session = await getAllowedSession();
  if (!session) throw new Error("unauthorized");
}

/** 只檢查與預覽,不寫入 */
export async function previewImport(raw: string): Promise<PreviewResult> {
  await requireSession();
  const parsed = parseImport(String(raw ?? ""));
  const dbReady = isDbConfigured();
  const current = dbReady && parsed.ok ? await fetchCurrentItems() : [];

  const blocks: PreviewBlock[] = parsed.blocks.map((b) => {
    // 交易紀錄、資產快照是「歷史」:合併成一列顯示筆數
    const rows: PreviewRow[] = [];
    const historyKinds = new Map<ImportItem["kind"], { n: number; latest: string }>();
    for (const it of b.items) {
      if (it.kind === "trades" || it.kind === "equity") {
        const h = historyKinds.get(it.kind) ?? { n: 0, latest: it.as_of };
        h.n += 1;
        if (new Date(it.as_of) > new Date(h.latest)) h.latest = it.as_of;
        historyKinds.set(it.kind, h);
        continue;
      }
      const cur = current.find((c) => c.bot === it.bot && c.kind === it.kind && c.key === it.key);
      let change: PreviewRow["change"] = "new";
      if (cur) change = new Date(it.as_of) < new Date(cur.as_of) ? "older" : "update";
      rows.push({ kind: it.kind, kindLabel: KIND_LABEL[it.kind], key: it.key, asOf: it.as_of, change, currentAsOf: cur?.as_of });
    }
    for (const [kind, h] of historyKinds) {
      rows.push({ kind, kindLabel: KIND_LABEL[kind], key: "", asOf: h.latest, change: "history", count: h.n });
    }
    return { index: b.index, bot: b.bot, startLine: b.startLine, issues: b.issues, rows };
  });

  return { ok: parsed.ok, dbReady, globalIssues: parsed.globalIssues, blocks };
}

export type CommitResult = { ok: true; importId: string; count: number } | { ok: false; error: string };

/** 確認匯入:伺服器端重新解析一次(不相信瀏覽器傳來的結果),全部通過才寫入 */
export async function commitImport(raw: string): Promise<CommitResult> {
  await requireSession();
  if (!isDbConfigured()) return { ok: false, error: "資料庫尚未設定,無法匯入。" };
  const parsed = parseImport(String(raw ?? ""));
  if (!parsed.ok) return { ok: false, error: "格式檢查沒有通過,請先修正錯誤。" };
  const items = parsed.blocks.flatMap((b) => b.items);
  try {
    const importId = await insertImport(String(raw), items);
    revalidatePath("/", "layout");
    return { ok: true, importId, count: items.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "寫入失敗" };
  }
}

export type RestoreResult = { ok: true; importId: string } | { ok: false; error: string };

export async function restoreVersion(importId: string, confirmed: boolean): Promise<RestoreResult> {
  await requireSession();
  if (!confirmed) return { ok: false, error: "請先勾選確認。" };
  if (!isDbConfigured()) return { ok: false, error: "資料庫尚未設定。" };
  if (!/^[0-9a-f-]{36}$/i.test(importId)) return { ok: false, error: "版本編號格式錯誤。" };
  try {
    const id = await restoreImport(importId);
    revalidatePath("/", "layout");
    return { ok: true, importId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "還原失敗" };
  }
}
