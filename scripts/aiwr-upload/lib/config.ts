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
  })
  .strict();

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
    report: z.string().min(1).optional(),
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
    report: z.string().min(1).optional(),
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
    columns: columnsSchema.optional(),
  })
  .strict();

const reportSchema = z
  .object({
    type: z.literal("report"),
    bot: z.string().trim().min(1).max(64).optional(),
    file: z.string().min(1),
  })
  .strict();

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
  }
  return parsed.data;
}
