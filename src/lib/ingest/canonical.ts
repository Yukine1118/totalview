import type { ImportItem } from "@/lib/import/schema";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** 同一瞬間的不同寫法(Z 與 +08:00、有沒有毫秒)收成同一個值,方便判斷「內容有沒有變」。 */
function normalize(value: unknown): unknown {
  if (typeof value === "string" && ISO.test(value)) {
    const t = new Date(value).getTime();
    if (!Number.isNaN(t)) return `t:${t}`;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = normalize(src[key]);
    return out;
  }
  return value;
}

/** 同一個 bot 的 items 指紋。順序、鍵的順序、時區寫法都不影響結果。 */
export function itemsFingerprint(items: ImportItem[]): string {
  const norm = items.map((it) =>
    normalize({
      kind: it.kind,
      key: it.key,
      as_of: it.as_of,
      payload: it.payload,
    }),
  );
  norm.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(norm);
}
