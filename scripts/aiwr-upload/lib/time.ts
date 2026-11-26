import { UploadError, type ClockZone, type DateOnlyRule } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
const DATE_TIME = /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

function validYmd(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * 檔案裡的時間轉成帶時區的 ISO。
 * - 已經是完整 ISO(含時區)就原樣保留。
 * - 只有日期:加密貨幣用當天 00:00 UTC(日線收盤),台股用當天 13:30 +08:00(現股收盤)。
 *   這兩個時刻不在檔案裡,是設定好的對應規則,文件有寫。
 * - 有時分但沒時區:加密貨幣視為 UTC,台股視為 +08:00。鐘點本身來自檔案。
 */
export function parseTime(raw: string, dateOnly: DateOnlyRule, zone: ClockZone): string {
  const s = raw.trim();
  if (ISO.test(s)) {
    if (Number.isNaN(new Date(s).getTime())) throw new UploadError(`無效的時間:${raw}`);
    return s;
  }
  const d = DATE.exec(s);
  if (d) {
    const y = Number(d[1]);
    const m = Number(d[2]);
    const day = Number(d[3]);
    if (!validYmd(y, m, day)) throw new UploadError(`無效的日期:${raw}`);
    const ymd = `${d[1]}-${d[2]}-${d[3]}`;
    return dateOnly === "utc_midnight" ? `${ymd}T00:00:00Z` : `${ymd}T13:30:00+08:00`;
  }
  const dt = DATE_TIME.exec(s);
  if (dt) {
    const y = Number(dt[1]);
    const m = Number(dt[2]);
    const day = Number(dt[3]);
    if (!validYmd(y, m, day)) throw new UploadError(`無效的日期:${raw}`);
    const sec = dt[6] ?? "00";
    const ymd = `${dt[1]}-${dt[2]}-${dt[3]}`;
    const clock = `${dt[4]}:${dt[5]}:${sec}`;
    if (Number(dt[4]) > 23 || Number(dt[5]) > 59 || Number(sec) > 59) throw new UploadError(`無效的時間:${raw}`);
    return zone === "UTC" ? `${ymd}T${clock}Z` : `${ymd}T${clock}+08:00`;
  }
  throw new UploadError(`無法判斷時間(請用 2026-11-20 或 2026-11-20T13:30:00+08:00):${raw}`);
}

/** 回傳其中最晚的一筆(字串本身來自檔案,不用現在時間)。 */
export function maxIso(values: string[]): string {
  if (values.length === 0) throw new UploadError("沒有任何時間可以當資料時間");
  return values.reduce((best, v) => (Date.parse(v) > Date.parse(best) ? v : best));
}
