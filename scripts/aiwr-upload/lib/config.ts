import { z } from "zod";
import { UploadError } from "./types";

const columnsSchema = z
  .object({
    symbol: z.string().min(1).optional(),
    qty: z.string().min(1).optional(),
    avg_cost: z.string().min(1).optional(),
    last_close: z.string().min(1).optional(),
    date: z.string().min(1).optional(),
    price_date: z.string().min(1).optional(),
    cash: z.string().min(1).optional(),
    equity: z.string().min(1).optional(),
    side: z.string().min(1).optional(),
    price: z.string().min(1).optional(),
    fee: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    executed_at: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    cost_date: z.string().min(1).optional(),
    close: z.string().min(1).optional(),
    strategy: z.string().min(1).optional(),
    entry_price: z.string().min(1).optional(),
  })
  .strict();

/** 摘要只摘某個標題底下的文字,不把整篇報告送出。 */
const summarySchema = z
  .object({
    section: z.string().trim().min(1),
    max_chars: z.number().int().positive().max(1000).default(1000),
  })
  .strict();

const reportRefSchema = z.union([
  z.string().min(1),
  z
    .object({
      file: z.string().min(1),
      summary: summarySchema.optional(),
    })
    .strict(),
]);

const strategySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    ledger: z.string().min(1).optional(),
    positions: z.string().min(1).optional(),
    trades: z.string().min(1).optional(),
    equity: z.string().min(1).optional(),
    equity_daily: z.string().min(1).optional(),
    ohlc_dir: z.string().min(1).optional(),
  })
  .strict();

const cryptoSchema = z
  .object({
    type: z.literal("crypto_paper"),
    parent_bot: z.string().trim().min(1).max(40),
    root: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3,5}$/).default("USDT"),
    start_capital: z.number().positive().default(10_000),
    report: reportRefSchema.optional(),
    /** 多個策略共用的交易檔,用 strategy 欄篩選 */
    trades: z.string().min(1).optional(),
    equity_daily: z.string().min(1).optional(),
    ohlc_dir: z.string().min(1).optional(),
    /** 例如 {symbol}_1d.csv。必須含 {symbol},不可以含路徑。 */
    ohlc_filename: z.string().min(1).default("{symbol}_1d.csv"),
    strategy_column: z.string().min(1).default("strategy"),
    columns: columnsSchema.optional(),
    ledger_keys: z
      .object({
        as_of: z.string().min(1).optional(),
        cash: z.string().min(1).optional(),
        equity: z.string().min(1).optional(),
        positions: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    strategies: z.array(strategySchema).min(1),
  })
  .strict();

const twPaperSchema = z
  .object({
    type: z.literal("tw_paper"),
    parent_bot: z.string().trim().min(1).max(40),
    root: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3,5}$/).default("TWD"),
    start_capital: z.number().positive().default(50_000),
    report: reportRefSchema.optional(),
    /** 多個策略共用;用 strategy 欄篩選。策略自己的路徑優先。 */
    positions: z.string().min(1).optional(),
    equity: z.string().min(1).optional(),
    trades: z.string().min(1).optional(),
    strategy_column: z.string().min(1).default("strategy"),
    columns: columnsSchema.optional(),
    strategies: z.array(strategySchema).min(1),
  })
  .strict();

const twRealSchema = z
  .object({
    type: z.literal("tw_real"),
    bot: z.string().trim().min(1).max(64),
    root: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3,5}$/).default("TWD"),
    cost_means: z.enum(["unit", "total"]).default("unit"),
    holdings: z.string().min(1),
    prices: z.string().min(1).optional(),
    /** 從報告裡的 markdown 表格讀收盤價。 */
    prices_report: z.string().min(1).optional(),
    price_table: z
      .object({
        heading: z.string().min(1).default("持股六檔收盤（證交所）"),
        symbol: z.string().min(1).default("代號"),
        close: z.string().min(1).default("收盤"),
      })
      .strict()
      .optional(),
    columns: columnsSchema.optional(),
  })
  .strict();

const reportSchema = z
  .object({
    type: z.literal("report"),
    bot: z.string().trim().min(1).max(64).optional(),
    file: z.string().min(1),
    /** 不寫就不送摘要(不會把整篇內文送出)。 */
    summary: summarySchema.optional(),
  })
  .strict();

export type SummarySpec = z.infer<typeof summarySchema>;

export const uploadConfigSchema = z
  .object({
    endpoint: z.string().url(),
    watermark: z.string().min(1).optional(),
    sources: z.array(z.discriminatedUnion("type", [cryptoSchema, twPaperSchema, twRealSchema, reportSchema])).min(1),
  })
  .strict();

export type UploadConfig = z.infer<typeof uploadConfigSchema>;
export type CryptoSource = z.infer<typeof cryptoSchema>;
export type TwPaperSource = z.infer<typeof twPaperSchema>;
export type TwRealSource = z.infer<typeof twRealSchema>;
export type ReportSource = z.infer<typeof reportSchema>;

const SECRET_KEY = /token|secret|password|api[_-]?key/i;

function rejectSecrets(value: unknown, path: string): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      throw new UploadError(`設定檔不可以放密鑰(${path}${key})。Token 請用環境變數 AIWR_INGEST_TOKEN。`);
    }
    if (child && typeof child === "object") rejectSecrets(child, `${path}${key}.`);
  }
}

/** endpoint 必須是 https。只有本機測試可以用 http://localhost 或 127.0.0.1。 */
export function assertEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new UploadError("endpoint 不是網址");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && local) return;
  throw new UploadError("endpoint 必須是 https。只有 localhost 可以用 http");
}

export function parseConfig(raw: unknown): UploadConfig {
  rejectSecrets(raw, "");
  const parsed = uploadConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(根)"}: ${issue.message}`).join("\n");
    throw new UploadError(`設定檔格式不對:\n${msg}`);
  }
  assertEndpoint(parsed.data.endpoint);
  for (const source of parsed.data.sources) {
    if (source.type === "crypto_paper" || source.type === "tw_paper") {
      for (const strategy of source.strategies) {
        if (strategy.name.includes("/")) throw new UploadError(`策略名稱不可以含 / :${strategy.name}`);
      }
    }
    if (source.type === "crypto_paper") {
      if (!source.ohlc_filename.includes("{symbol}")) throw new UploadError("ohlc_filename 必須含 {symbol}");
      if (source.ohlc_filename.includes("/") || source.ohlc_filename.includes("\\") || source.ohlc_filename.includes("..")) {
        throw new UploadError("ohlc_filename 只能是檔名,不能含路徑");
      }
    }
  }
  return parsed.data;
}
