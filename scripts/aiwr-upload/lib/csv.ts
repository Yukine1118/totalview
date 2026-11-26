import { UploadError } from "./types";

/** 小型 CSV 解析:支援引號、引號內逗號與 ""。標題列必填,空白列略過。 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  if (rows.length === 0 || (rows.length === 1 && rows[0].every((c) => c.trim() === ""))) return [];
  const header = rows[0].map((h) => h.trim());
  if (header.some((h) => !h)) throw new UploadError("CSV 標題列有空白欄位");
  const seen = new Set<string>();
  for (const h of header) {
    const key = h.toLowerCase();
    if (seen.has(key)) throw new UploadError(`CSV 標題重複:${h}`);
    seen.add(key);
  }
  const out: Record<string, string>[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim() === "")) continue;
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = (row[i] ?? "").trim();
    });
    out.push(rec);
  }
  return out;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (inQuotes) throw new UploadError("CSV 有未結束的引號");
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}
