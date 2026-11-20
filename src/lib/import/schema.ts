import { z } from "zod";

/**
 * aiwr/v1:Grok bot 回報最後附上的 JSON 格式。
 * 說明文件:docs/grok-output-format.md(改這裡也要同步改文件與 docs/aiwr-v1.schema.json)
 *
 * 規則:
 * - 每段 JSON 一定有 bot(名稱)與 generated_at(產生時間)。
 * - 每個區塊/每筆資料都有自己的資料時間(as_of 或 executed_at),而且必須帶時區。
 * - 區塊都可以省略;省略 = 不更新那一類資料。
 */

/** 必須帶時區的 ISO 8601 時間,例:2026-11-20T14:35:00+08:00 */
const isoTime = z
  .string({ required_error: "必填", invalid_type_error: "應該是文字(時間)" })
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
    "時間格式要像 2026-11-20T14:35:00+08:00(必須有時區)",
  )
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "不是有效的日期時間");

const num = z.number({ required_error: "必填", invalid_type_error: "應該是數字(不要加引號或單位)" }).finite();
const nonNeg = num.nonnegative("不能是負數");
const text = (max: number) =>
  z.string({ required_error: "必填", invalid_type_error: "應該是文字" }).trim().min(1, "不能是空字串").max(max, `最多 ${max} 個字`);
const currency = z
  .string({ required_error: "必填", invalid_type_error: "應該是文字" })
  .regex(/^[A-Z]{3,5}$/, "幣別用大寫代碼,例如 TWD、USDT");
const account = z.enum(["real", "paper"], { errorMap: () => ({ message: '只能是 "real"(真實)或 "paper"(模擬)' }) });
const market = z.enum(["TW", "CRYPTO"], { errorMap: () => ({ message: '只能是 "TW" 或 "CRYPTO"' }) });

export const botStatusSchema = z
  .object({
    status: z.enum(["ok", "warn", "stop"], { errorMap: () => ({ message: '只能是 "ok"、"warn" 或 "stop"' }) }),
    last_run_at: isoTime,
    note: text(300).optional(),
    as_of: isoTime,
  })
  .strict();

export const aiUsageSchema = z
  .object({
    service: z.enum(["Claude Pro", "Gemini Pro", "Grok Premium", "Google AI Studio"], {
      errorMap: () => ({ message: '只能是 "Claude Pro"、"Gemini Pro"、"Grok Premium"、"Google AI Studio"' }),
    }),
    used_pct: num.min(0, "介於 0–100").max(100, "介於 0–100").nullable(),
    reset_at: isoTime.nullable().optional(),
    source: z.enum(["auto", "manual"]).default("manual"),
    note: text(300).optional(),
    as_of: isoTime,
  })
  .strict();

export const positionItemSchema = z
  .object({
    market,
    symbol: text(20),
    name: text(40).optional(),
    qty: nonNeg,
    avg_cost: nonNeg,
    last_price: nonNeg.nullable(),
    currency,
    price_as_of: isoTime.nullable(),
  })
  .strict();

export const positionsSchema = z
  .object({
    account,
    as_of: isoTime,
    items: z.array(positionItemSchema, { invalid_type_error: "應該是陣列 [ ... ]" }).max(500),
  })
  .strict();

export const tradeSchema = z
  .object({
    account,
    market,
    symbol: text(20),
    side: z.enum(["buy", "sell"], { errorMap: () => ({ message: '只能是 "buy" 或 "sell"' }) }),
    qty: nonNeg,
    price: nonNeg,
    fee: nonNeg.optional(),
    currency,
    executed_at: isoTime,
    note: text(200).optional(),
  })
  .strict();

export const equitySchema = z
  .object({
    account,
    market,
    currency,
    equity: num,
    cash: num.nullable().optional(),
    as_of: isoTime,
  })
  .strict();

export const strategyItemSchema = z
  .object({
    name: text(60),
    market: text(40),
    return_pct: num.nullable(),
    max_drawdown_pct: num.max(0, "最大回撤應該是 0 或負數,例如 -12.5").nullable(),
    trades: z.number({ invalid_type_error: "應該是整數" }).int("應該是整數").nonnegative().nullable(),
    oos_return_pct: num.nullable(),
    oos_period: text(60).optional(),
    curve: z.array(num).max(400, "曲線最多 400 個點").optional(),
  })
  .strict();

export const strategiesSchema = z
  .object({
    as_of: isoTime,
    items: z.array(strategyItemSchema, { invalid_type_error: "應該是陣列 [ ... ]" }).max(100),
  })
  .strict();

export const summarySchema = z.object({ text: text(1000), as_of: isoTime }).strict();

export const fxSchema = z
  .object({
    base: currency,
    quote: currency,
    rate: num.positive("匯率要大於 0"),
    source: text(60),
    as_of: isoTime,
  })
  .strict();

export const reportSchema = z
  .object({
    schema: z.literal("aiwr/v1", { errorMap: () => ({ message: '必須是 "aiwr/v1"' }) }),
    bot: text(64),
    generated_at: isoTime,
    bot_status: botStatusSchema.optional(),
    ai_usage: z.array(aiUsageSchema).max(10).optional(),
    positions: z.array(positionsSchema).max(2).optional(),
    trades: z.array(tradeSchema).max(500).optional(),
    equity_snapshots: z.array(equitySchema).max(500).optional(),
    strategies: strategiesSchema.optional(),
    summary: summarySchema.optional(),
    fx_rates: z.array(fxSchema).max(20).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const has = ["bot_status", "ai_usage", "positions", "trades", "equity_snapshots", "strategies", "summary", "fx_rates"].some(
      (k) => r[k as keyof typeof r] !== undefined,
    );
    if (!has) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "至少要有一個資料區塊(例如 bot_status)", path: [] });
    const accounts = (r.positions ?? []).map((p) => p.account);
    if (new Set(accounts).size !== accounts.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "positions 裡同一個 account 只能出現一次", path: ["positions"] });
    }
  });

export type Report = z.infer<typeof reportSchema>;

/** 存進資料庫的一筆 */
export type ImportItem = {
  bot: string;
  kind: "bot_status" | "ai_usage" | "positions_real" | "positions_paper" | "trades" | "equity" | "strategies" | "summary" | "fx";
  key: string;
  as_of: string;
  payload: unknown;
};

/** 把一份 report 拆成資料庫的多筆 items */
export function reportToItems(r: Report): ImportItem[] {
  const out: ImportItem[] = [];
  const bot = r.bot;
  if (r.bot_status) out.push({ bot, kind: "bot_status", key: "", as_of: r.bot_status.as_of, payload: r.bot_status });
  for (const u of r.ai_usage ?? []) out.push({ bot, kind: "ai_usage", key: u.service, as_of: u.as_of, payload: u });
  for (const p of r.positions ?? []) {
    out.push({ bot, kind: p.account === "real" ? "positions_real" : "positions_paper", key: "", as_of: p.as_of, payload: p });
  }
  for (const t of r.trades ?? []) {
    out.push({ bot, kind: "trades", key: `${t.account}|${t.symbol}|${t.executed_at}`, as_of: t.executed_at, payload: t });
  }
  for (const e of r.equity_snapshots ?? []) {
    out.push({ bot, kind: "equity", key: `${e.account}|${e.market}|${e.currency}`, as_of: e.as_of, payload: e });
  }
  if (r.strategies) out.push({ bot, kind: "strategies", key: "", as_of: r.strategies.as_of, payload: r.strategies });
  if (r.summary) out.push({ bot, kind: "summary", key: "", as_of: r.summary.as_of, payload: r.summary });
  for (const f of r.fx_rates ?? []) out.push({ bot, kind: "fx", key: `${f.base}/${f.quote}`, as_of: f.as_of, payload: f });
  return out;
}

export const KIND_LABEL: Record<ImportItem["kind"], string> = {
  bot_status: "bot 狀態",
  ai_usage: "AI 用量",
  positions_real: "真實持股",
  positions_paper: "模擬持股",
  trades: "交易紀錄",
  equity: "資產快照",
  strategies: "策略績效",
  summary: "摘要",
  fx: "匯率",
};
