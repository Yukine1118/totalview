import { BEGIN, END } from "@/lib/import/parse";
import type { AiService } from "./types";

/** 手動更新表單 → aiwr/v1 JSON(和 bot 回報走同一條匯入流程,一樣有預覽、歷史版本、還原) */

export type ManualEntry = {
  service: AiService;
  usedPct: number | null;
  /** datetime-local 的值(台北時間),例:2026-11-21T03:00;空字串 = 不填 */
  resetLocal: string;
  note: string;
};

/** Date → 台北時間 ISO(帶 +08:00) */
export function toTaipeiIso(d: Date): string {
  const t = new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 19);
  return `${t}+08:00`;
}

export function buildManualUsageReport(entries: ManualEntry[], now: Date): string {
  const asOf = toTaipeiIso(now);
  const report = {
    schema: "aiwr/v1",
    bot: "manual",
    generated_at: asOf,
    ai_usage: entries.map((e) => ({
      service: e.service,
      used_pct: e.usedPct,
      ...(e.resetLocal ? { reset_at: `${e.resetLocal.length === 16 ? `${e.resetLocal}:00` : e.resetLocal}+08:00` } : {}),
      source: "manual",
      ...(e.note.trim() ? { note: e.note.trim().slice(0, 300) } : {}),
      as_of: asOf,
    })),
  };
  return [BEGIN, JSON.stringify(report, null, 2), END].join("\n");
}

/** ISO 時間 → datetime-local 用的台北時間字串(預填表單用) */
export function isoToTaipeiLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 16);
}
