import { findNodeAtLocation, parse, parseTree, printParseErrorCode, type ParseError } from "jsonc-parser";
import type { ZodIssue } from "zod";
import { reportSchema, reportToItems, type ImportItem, type Report } from "./schema";

/**
 * 解析使用者貼上的文字(可以一次貼多個 bot)。
 * - 優先找 ===AIWR-BEGIN=== … ===AIWR-END=== 標記之間的內容(可以連同 Grok 整段回覆一起貼)。
 * - 沒有標記時,把整段當成一個 JSON 物件,或一個 JSON 陣列(多個物件)。
 * - 自動去掉 ```json 這種程式碼框。
 * - 錯誤一律回報「第幾段、第幾行(以整段貼上的文字計算)、哪個欄位、錯在哪」。
 */

export const BEGIN = "===AIWR-BEGIN===";
export const END = "===AIWR-END===";

/** 單次匯入的字數上限(貼上與自動匯入共用) */
export const IMPORT_MAX_CHARS = 500_000;

export type ParseIssue = {
  block: number; // 第幾段(1 起算)
  bot?: string;
  line: number; // 以整段貼上文字計算的行號(1 起算)
  column: number;
  path: string; // 例:positions[0].items[2].qty
  message: string;
};

export type ParsedBlock = {
  index: number;
  startLine: number;
  bot?: string;
  report?: Report;
  items: ImportItem[];
  issues: ParseIssue[];
};

export type ParseResult = {
  blocks: ParsedBlock[];
  /** 整份貼上內容的問題(例如找不到任何 JSON、重複的 bot) */
  globalIssues: string[];
  ok: boolean;
};

type Segment = { text: string; startLine: number };

function splitSegments(raw: string): { segments: Segment[]; issues: string[] } {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const segments: Segment[] = [];
  const issues: string[] = [];
  let inBlock = false;
  let start = 0;
  let buf: string[] = [];

  lines.forEach((line, i) => {
    const t = line.trim();
    if (t === BEGIN) {
      if (inBlock) issues.push(`第 ${i + 1} 行:前一段還沒有 ${END} 就又出現 ${BEGIN}`);
      inBlock = true;
      start = i + 2;
      buf = [];
    } else if (t === END) {
      if (!inBlock) issues.push(`第 ${i + 1} 行:有 ${END} 但前面沒有 ${BEGIN}`);
      else segments.push({ text: buf.join("\n"), startLine: start });
      inBlock = false;
    } else if (inBlock) {
      // 程式碼框 ``` 那一行換成空行,保持行號不變
      buf.push(/^```/.test(t) ? "" : line);
    }
  });
  if (inBlock) issues.push(`最後一段有 ${BEGIN} 但缺少 ${END}`);

  if (segments.length === 0 && issues.length === 0) {
    // 沒有標記:整段當 JSON
    const body = lines.map((l) => (/^```/.test(l.trim()) ? "" : l)).join("\n");
    if (body.trim()) segments.push({ text: body, startLine: 1 });
  }
  return { segments, issues };
}

function lineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      last = i;
    }
  }
  return { line, column: offset - last };
}

function pathToString(path: (string | number)[]): string {
  return path.reduce<string>((s, p) => (typeof p === "number" ? `${s}[${p}]` : s ? `${s}.${p}` : p), "") || "(整個物件)";
}

const JSON_ERROR_ZH: Record<string, string> = {
  InvalidSymbol: "有不合法的字元(JSON 只能用英文半形雙引號 \")",
  InvalidNumberFormat: "數字格式錯誤",
  PropertyNameExpected: "這裡應該是欄位名稱(要用雙引號包起來)",
  ValueExpected: "這裡缺少值",
  ColonExpected: "欄位名稱後面缺少冒號 :",
  CommaExpected: "缺少逗號 ,",
  CloseBraceExpected: "缺少右大括號 }",
  CloseBracketExpected: "缺少右中括號 ]",
  EndOfFileExpected: "JSON 結束後還有多餘的內容(一段只能有一個物件)",
  InvalidCommentToken: "JSON 不能有註解(// 或 /* */)",
  UnexpectedEndOfComment: "註解沒有結尾",
  UnexpectedEndOfString: "字串缺少結尾的雙引號",
  UnexpectedEndOfNumber: "數字不完整",
  InvalidUnicode: "Unicode 編碼錯誤",
  InvalidEscapeCharacter: "跳脫字元錯誤",
  InvalidCharacter: "字串裡有不合法的字元(換行要寫成 \\n)",
};

function zodMessage(issue: ZodIssue): string {
  if (issue.code === "unrecognized_keys") return `不認得的欄位:${issue.keys.join("、")}(請檢查拼字)`;
  if (issue.code === "invalid_type" && issue.received === "undefined") return "缺少這個必填欄位";
  if (issue.code === "invalid_type" && issue.received === "null") return "不能是 null";
  return issue.message;
}

function parseSegment(seg: Segment, index: number): ParsedBlock {
  const block: ParsedBlock = { index, startLine: seg.startLine, items: [], issues: [] };
  const errors: ParseError[] = [];
  const value = parse(seg.text, errors, { allowTrailingComma: false, disallowComments: true });

  const at = (offset: number) => {
    const lc = lineCol(seg.text, offset);
    return { line: lc.line + seg.startLine - 1, column: lc.column };
  };

  if (errors.length > 0) {
    for (const e of errors.slice(0, 5)) {
      const code = printParseErrorCode(e.error);
      block.issues.push({ block: index, ...at(e.offset), path: "", message: JSON_ERROR_ZH[code] ?? `JSON 格式錯誤(${code})` });
    }
    return block;
  }

  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    block.issues.push({ block: index, line: seg.startLine, column: 1, path: "", message: "每一段應該是一個 JSON 物件 { ... }" });
    return block;
  }

  block.bot = typeof (value as { bot?: unknown }).bot === "string" ? (value as { bot: string }).bot : undefined;
  const result = reportSchema.safeParse(value);
  if (!result.success) {
    const tree = parseTree(seg.text);
    for (const issue of result.error.issues.slice(0, 20)) {
      // 找到出錯欄位在原文的位置;欄位不存在就往上找父層
      let node = undefined;
      for (let n = issue.path.length; tree && !node && n >= 0; n--) {
        node = n === 0 ? tree : findNodeAtLocation(tree, issue.path.slice(0, n));
      }
      const pos = node ? at(node.parent?.type === "property" ? node.parent.offset : node.offset) : { line: seg.startLine, column: 1 };
      block.issues.push({ block: index, bot: block.bot, ...pos, path: pathToString(issue.path), message: zodMessage(issue) });
    }
    return block;
  }

  block.report = result.data;
  block.items = reportToItems(result.data);
  return block;
}

/** 把多段 JSON(可能還混著文字)整理成「段落 + 錯誤清單」 */
export function parseImport(raw: string): ParseResult {
  if (raw.length > IMPORT_MAX_CHARS) {
    return { blocks: [], globalIssues: [`內容太長(超過 ${IMPORT_MAX_CHARS.toLocaleString()} 字)`], ok: false };
  }

  const { segments, issues } = splitSegments(raw);
  const globalIssues = [...issues];
  if (segments.length === 0 && globalIssues.length === 0) globalIssues.push("沒有找到任何 JSON。請貼上 bot 回報裡 ===AIWR-BEGIN=== 到 ===AIWR-END=== 的內容。");

  // 沒有標記、整段是陣列:展開成多段
  const blocks: ParsedBlock[] = [];
  segments.forEach((seg) => {
    const trimmed = seg.text.trim();
    if (trimmed.startsWith("[")) {
      const tree = parseTree(seg.text);
      if (tree?.type === "array" && tree.children) {
        for (const child of tree.children) {
          const sub = seg.text.slice(child.offset, child.offset + child.length);
          const lc = lineCol(seg.text, child.offset);
          blocks.push(parseSegment({ text: sub, startLine: seg.startLine + lc.line - 1 }, blocks.length + 1));
        }
        return;
      }
    }
    blocks.push(parseSegment(seg, blocks.length + 1));
  });

  // 同一次貼上,同一個 bot 只能出現一次(避免不知道哪段才是最新的)
  const seen = new Map<string, number>();
  for (const b of blocks) {
    if (!b.bot) continue;
    if (seen.has(b.bot)) {
      globalIssues.push(`bot「${b.bot}」出現在第 ${seen.get(b.bot)} 段和第 ${b.index} 段,同一次只能貼一份`);
    } else seen.set(b.bot, b.index);
  }

  const ok = globalIssues.length === 0 && blocks.length > 0 && blocks.every((b) => b.issues.length === 0);
  return { blocks, globalIssues, ok };
}
