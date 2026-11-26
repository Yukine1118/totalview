import { UploadError } from "./types";

const NUMBER = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;

/** 先用設定指定的欄名,再用別名。空白視為沒有這個值。 */
export function cell(row: Record<string, string>, aliases: string[], configured?: string): string | undefined {
  const wanted = [...(configured ? [configured] : []), ...aliases];
  const byLower = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    if (!byLower.has(key.toLowerCase())) byLower.set(key.toLowerCase(), value);
  }
  for (const key of wanted) {
    const value = byLower.get(key.toLowerCase());
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return undefined;
}

export function parseNumber(raw: string, label: string): number {
  const s = raw.trim();
  if (!NUMBER.test(s)) throw new UploadError(`${label} 不是純數字(不要加單位或文字):${s}`);
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new UploadError(`${label} 不是有限數字:${s}`);
  return n;
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** 報酬率。起始資金來自設定(不是從行情猜的);沒有權益或起始資金就 null。 */
export function returnPct(equity: number | null, startCapital: number | null): number | null {
  if (equity === null || startCapital === null || !(startCapital > 0)) return null;
  return round4((equity / startCapital - 1) * 100);
}

/** 由權益序列算出的最大回撤(0 或負數)。沒有點就 null;一個點是 0。 */
export function maxDrawdownPct(series: number[]): number | null {
  if (series.length === 0) return null;
  let peak = series[0];
  let maxDd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    if (!(peak > 0)) continue;
    const dd = ((v - peak) / peak) * 100;
    if (dd < maxDd) maxDd = dd;
  }
  if (!(peak > 0)) return null;
  return round4(maxDd);
}
