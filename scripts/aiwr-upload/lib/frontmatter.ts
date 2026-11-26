import { parse as parseYaml } from "yaml";
import { UploadError } from "./types";

/**
 * 報告開頭的 YAML。用 YAML 1.2 core:巢狀的 sources 清單可以解析,
 * 時間維持文字(不會被轉成 Date,避免時區被改掉)。
 */
export function parseFrontmatter(md: string): { data: Record<string, unknown>; body: string } {
  const text = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) throw new UploadError("報告開頭要是 --- 的 YAML frontmatter");
  const end = text.indexOf("\n---", 4);
  if (end < 0) throw new UploadError("報告的 frontmatter 沒有結束的 ---");
  const raw = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, "");
  let data: unknown;
  try {
    data = parseYaml(raw, { schema: "core" });
  } catch (e) {
    throw new UploadError(`報告 frontmatter 不是合法的 YAML:${e instanceof Error ? e.message.split("\n")[0] : "解析失敗"}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UploadError("報告 frontmatter 必須是一組欄位");
  return { data: data as Record<string, unknown>, body };
}

/** 只取字串或數字。物件、清單(例如 sources)不當成文字送出。 */
export function yamlScalar(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** 某個標題底下的文字,到下一個同級或更高的標題為止。找不到回 null。 */
export function extractSection(body: string, title: string): string | null {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  let level = 0;
  const wanted = title.trim();
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i]);
    if (!match) continue;
    const text = match[2].trim();
    if (text === wanted || text.includes(wanted)) {
      start = i + 1;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) return null;
  const buf: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const match = /^(#{1,6})\s+/.exec(lines[i]);
    if (match && match[1].length <= level) break;
    buf.push(lines[i]);
  }
  return buf.join("\n").trim();
}

function splitRow(line: string): string[] {
  const parts = line.split("|").map((cell) => cell.trim());
  if (parts.length && parts[0] === "") parts.shift();
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function isSeparator(line: string): boolean {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * 從某個標題後面的第一個 markdown 表格讀收盤價。
 * 標題、代號欄、收盤欄都由設定指定。表格裡多出來的欄(漲跌)不送。
 */
export function closePricesFromMarkdown(
  md: string,
  heading: string,
  symbolHeader: string,
  closeHeader: string,
): { symbol: string; close: string }[] {
  const lines = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const wanted = heading.trim();
  let inSection = false;
  let level = 0;
  let headers: string[] | null = null;
  const out: { symbol: string; close: string }[] = [];
  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (headingMatch) {
      if (!inSection) {
        const text = headingMatch[2].trim();
        if (text === wanted || text.includes(wanted)) {
          inSection = true;
          level = headingMatch[1].length;
        }
      } else if (headingMatch[1].length <= level) {
        break;
      }
      continue;
    }
    if (!inSection || !line.trim().startsWith("|")) continue;
    if (!headers) {
      if (isSeparator(line)) continue;
      headers = splitRow(line);
      continue;
    }
    if (isSeparator(line)) continue;
    const cells = splitRow(line);
    const symbolIndex = headers.findIndex((h) => h === symbolHeader);
    const closeIndex = headers.findIndex((h) => h === closeHeader);
    if (symbolIndex < 0 || closeIndex < 0) {
      throw new UploadError(`收盤價表格找不到欄位「${symbolHeader}」或「${closeHeader}」。表頭是:${headers.join("、")}`);
    }
    const symbol = cells[symbolIndex]?.trim() ?? "";
    const close = cells[closeIndex]?.trim() ?? "";
    if (!symbol || !close) continue;
    out.push({ symbol, close });
  }
  return out;
}
