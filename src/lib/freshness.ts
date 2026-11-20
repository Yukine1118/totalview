import type { FreshnessRule } from "@/config/freshness";

/**
 * 判斷資料新鮮度(純函式,方便測試)。
 * fresh = 正常;warn = 即將過期;stale = 已過期;none = 無資料(或時間格式錯誤)。
 */
export type FreshState = "fresh" | "warn" | "stale" | "none";

export type FreshResult = {
  state: FreshState;
  /** 資料時間 */
  asOf: Date | null;
  /** 在這個時間之前更新都算新鮮(只有能算出來時才有) */
  staleAfter?: Date;
};

const MIN = 60_000;
const TAIPEI_OFFSET_MS = 8 * 60 * MIN; // 台北 UTC+8,沒有日光節約

export function parseTime(v: string | Date | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function evaluateFreshness(
  asOfInput: string | Date | null | undefined,
  rule: FreshnessRule,
  now: Date = new Date(),
  holidays: string[] = [],
): FreshResult {
  const asOf = parseTime(asOfInput);
  if (!asOf) return { state: "none", asOf: null };

  switch (rule.kind) {
    case "interval": {
      const age = now.getTime() - asOf.getTime();
      const max = rule.maxAgeMin * MIN;
      const staleAfter = new Date(asOf.getTime() + max);
      if (age > max) return { state: "stale", asOf, staleAfter };
      if (age > max * (rule.warnRatio ?? 0.8)) return { state: "warn", asOf, staleAfter };
      return { state: "fresh", asOf, staleAfter };
    }

    case "tw_close": {
      // 找出「最近一個已經過了 due 時間的交易日」,資料必須在那天收盤之後
      const day = latestDueTradingDay(now, rule.dueHHMM, holidays);
      if (!day) return { state: "fresh", asOf };
      const mustBeAfter = taipeiTime(day, rule.closeHHMM);
      return { state: asOf.getTime() >= mustBeAfter.getTime() ? "fresh" : "stale", asOf };
    }

    case "utc_daily": {
      // 最近一次「收線 + 寬限」已經過去的 UTC 00:00
      const grace = rule.graceHours * 60 * MIN;
      const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const close = now.getTime() >= todayMidnight + grace ? todayMidnight : todayMidnight - 24 * 60 * MIN;
      return { state: asOf.getTime() >= close ? "fresh" : "stale", asOf };
    }
  }
}

/** 台北日期字串 YYYY-MM-DD */
export function taipeiDateString(d: Date): string {
  return new Date(d.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 某個台北日期的某個台北時間,轉成 Date */
function taipeiTime(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - TAIPEI_OFFSET_MS);
}

function isTradingDay(dateStr: string, holidays: string[]): boolean {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.includes(dateStr);
}

function latestDueTradingDay(now: Date, dueHHMM: string, holidays: string[]): string | null {
  let cursor = taipeiDateString(now);
  for (let i = 0; i < 30; i++) {
    if (isTradingDay(cursor, holidays) && taipeiTime(cursor, dueHHMM).getTime() <= now.getTime()) {
      return cursor;
    }
    const [y, mo, d] = cursor.split("-").map(Number);
    cursor = new Date(Date.UTC(y, mo - 1, d) - 24 * 60 * MIN).toISOString().slice(0, 10);
  }
  return null;
}

/** 顯示用:台北時間「11/19 14:35」 */
export function formatTaipei(d: Date): string {
  const t = new Date(d.getTime() + TAIPEI_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/** 顯示用:「剛剛 / 5 分鐘前 / 3 小時前 / 2 天前」 */
export function formatAgo(d: Date, now: Date = new Date()): string {
  const diff = now.getTime() - d.getTime();
  if (diff < 0) return "未來時間";
  const m = Math.floor(diff / MIN);
  if (m < 1) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}
