import { createHash } from "node:crypto";
import path from "node:path";
import { reportSchema, type Report } from "@/lib/import/schema";
import { cell, maxDrawdownPct, parseNumber, returnPct } from "./columns";
import type { CryptoSource, ReportSource, TwPaperSource, TwRealSource, UploadConfig } from "./config";
import { parseCsv } from "./csv";
import { maxIso, parseTime } from "./time";
import { UploadError, type ClockZone, type ColumnMap, type DateOnlyRule, type Io, type Watermark } from "./types";

/**
 * 把本機 bot 檔案編成 aiwr/v1。
 *
 * 原則:檔案裡沒有的值就送 null 或整段省略,不用現在時間,也不用起始資金充當現金或權益。
 * 成本時間(positions.as_of)和價格時間(price_as_of)分開,不會互相抄。
 * 每個模擬策略用自己的 bot 名稱 `父bot/策略`,父 bot 只放狀態、策略績效與摘要。
 */

type Draft = {
  bot: string;
  generated_at?: string;
  /** true 表示 generated_at 來自報告 frontmatter,不要被資料時間蓋掉 */
  fromReport?: boolean;
  bot_status?: Report["bot_status"];
  positions?: Report["positions"];
  trades?: Report["trades"];
  equity_snapshots?: Report["equity_snapshots"];
  strategies?: Report["strategies"];
  summary?: Report["summary"];
  warnings: string[];
  hashes: string[];
};

export type BuiltUpload = {
  reports: Report[];
  warnings: string[];
  hashesByBot: Record<string, string[]>;
};

const BUY = new Set(["buy", "b", "long", "買"]);
const SELL = new Set(["sell", "s", "short", "賣"]);

function subBot(parent: string, strategy: string): string {
  const bot = `${parent}/${strategy}`;
  if (bot.length > 64) throw new UploadError(`bot 名稱超過 64 字:${bot}`);
  return bot;
}

export function resolveInside(root: string, rel: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, rel);
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) throw new UploadError(`路徑超出資料夾:${rel}`);
  return abs;
}

function mustRead(io: Io, abs: string, label: string): string {
  if (!io.exists(abs)) throw new UploadError(`找不到${label}:${abs}`);
  return io.read(abs);
}

function parseSide(raw: string): "buy" | "sell" {
  const trimmed = raw.trim();
  if (BUY.has(trimmed) || BUY.has(trimmed.toLowerCase())) return "buy";
  if (SELL.has(trimmed) || SELL.has(trimmed.toLowerCase())) return "sell";
  throw new UploadError(`看不懂的買賣方向:${raw}(只接受 buy/sell)`);
}

function tradeHash(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function checkSymbol(symbol: string): void {
  if (symbol.length > 20) throw new UploadError(`代號超過 20 字:${symbol}`);
}

function checkCurrency(fileValue: string | undefined, expected: string, label: string): void {
  if (fileValue && fileValue.toUpperCase() !== expected) {
    throw new UploadError(`${label} 的幣別是 ${fileValue},設定是 ${expected}。不會自動換算。`);
  }
}

type Snap = NonNullable<Report["equity_snapshots"]>[number];
type PosItem = NonNullable<Report["positions"]>[number]["items"][number];
type Trade = NonNullable<Report["trades"]>[number];

function readEquity(
  csv: string,
  account: "paper" | "real",
  market: "TW" | "CRYPTO",
  currency: string,
  dateOnly: DateOnlyRule,
  zone: ClockZone,
  columns?: ColumnMap,
): Snap[] {
  const snaps: Snap[] = [];
  for (const row of parseCsv(csv)) {
    const dateRaw = cell(row, ["date", "as_of", "time", "timestamp"], columns?.date);
    const eqRaw = cell(row, ["equity", "equity_value", "total"], columns?.equity);
    if (!dateRaw || eqRaw === undefined) throw new UploadError("資產列缺少 date 或 equity");
    checkCurrency(cell(row, ["currency"]), currency, "資產");
    const cashRaw = cell(row, ["cash", "quote_cash"], columns?.cash);
    const cash = cashRaw === undefined ? undefined : parseNumber(cashRaw, "cash");
    snaps.push({
      account,
      market,
      currency,
      equity: parseNumber(eqRaw, "equity"),
      ...(cash !== undefined ? { cash } : {}),
      as_of: parseTime(dateRaw, dateOnly, zone),
    });
  }
  snaps.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
  return snaps;
}

function trimSnaps(snaps: Snap[], bot: string, warnings: string[]): Snap[] {
  if (snaps.length <= 500) return snaps;
  warnings.push(`${bot} 資產快照超過 500 筆,只送最近 500 筆`);
  return snaps.slice(-500);
}

function readJsonObject(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UploadError(`${label} 不是合法 JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UploadError(`${label} 必須是 JSON 物件`);
  return value as Record<string, unknown>;
}

function pickField(obj: Record<string, unknown>, keys: string[]): unknown {
  const lower = new Map(Object.keys(obj).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const real = lower.get(key.toLowerCase());
    if (real === undefined) continue;
    const value = obj[real];
    if (value === undefined || value === null || value === "") continue;
    return value;
  }
  return undefined;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new UploadError(`${label} 不是有限數字`);
    return value;
  }
  if (typeof value === "string") return parseNumber(value, label);
  throw new UploadError(`${label} 不是數字`);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new UploadError(`${label} 必須是文字`);
  return value.trim();
}

function strategyItem(
  name: string,
  market: string,
  equity: number | null,
  series: number[],
  tradeCount: number | null,
  startCapital: number,
): NonNullable<Report["strategies"]>["items"][number] {
  const curve = series.slice(-400);
  return {
    name,
    market,
    return_pct: returnPct(equity, startCapital),
    max_drawdown_pct: maxDrawdownPct(series),
    trades: tradeCount,
    oos_return_pct: null,
    ...(curve.length > 0 ? { curve } : {}),
  };
}

function mapTrades(opts: {
  csv: string;
  bot: string;
  account: "paper" | "real";
  market: "TW" | "CRYPTO";
  currency: string;
  dateOnly: DateOnlyRule;
  zone: ClockZone;
  columns?: ColumnMap;
  sent: Set<string>;
}): { trades: Trade[]; hashes: string[]; count: number; times: string[] } {
  const rows = parseCsv(opts.csv);
  const trades: Trade[] = [];
  const hashes: string[] = [];
  const times: string[] = [];
  for (const row of rows) {
    const executedRaw = cell(row, ["executed_at", "time", "timestamp", "date"], opts.columns?.executed_at);
    const symbol = cell(row, ["symbol", "pair", "ticker"], opts.columns?.symbol);
    const sideRaw = cell(row, ["side", "direction"], opts.columns?.side);
    const qtyRaw = cell(row, ["qty", "quantity", "size", "股數"], opts.columns?.qty);
    const priceRaw = cell(row, ["price", "fill_price"], opts.columns?.price);
    if (!executedRaw || !symbol || !sideRaw || qtyRaw === undefined || priceRaw === undefined) {
      throw new UploadError(`${opts.bot} 有一列交易缺少時間、代號、方向、數量或價格`);
    }
    checkSymbol(symbol);
    checkCurrency(cell(row, ["currency"]), opts.currency, symbol);
    const side = parseSide(sideRaw);
    const qty = parseNumber(qtyRaw, "qty");
    const price = parseNumber(priceRaw, "price");
    if (qty < 0 || price < 0) throw new UploadError(`${opts.bot} ${symbol} 的數量或價格是負的`);
    const executed_at = parseTime(executedRaw, opts.dateOnly, opts.zone);
    times.push(executed_at);
    const feeRaw = cell(row, ["fee", "commission"], opts.columns?.fee);
    const fee = feeRaw === undefined ? undefined : parseNumber(feeRaw, "fee");
    const note = cell(row, ["note"], opts.columns?.note);
    const hash = tradeHash([opts.bot, symbol, side, qty, price, fee ?? null, executed_at, opts.currency, note ?? null]);
    if (opts.sent.has(hash)) continue;
    hashes.push(hash);
    trades.push({
      account: opts.account,
      market: opts.market,
      symbol,
      side,
      qty,
      price,
      ...(fee !== undefined ? { fee } : {}),
      currency: opts.currency,
      executed_at,
      ...(note ? { note } : {}),
    });
  }
  trades.sort((a, b) => Date.parse(a.executed_at) - Date.parse(b.executed_at) || a.symbol.localeCompare(b.symbol));
  if (trades.length > 500) throw new UploadError(`${opts.bot} 這次要送的新交易超過 500 筆。請先分批,或確認水位檔。`);
  return { trades, hashes, count: rows.length, times };
}

function ohlcNames(symbol: string): string[] {
  if (symbol.includes("..") || symbol.includes("/") || symbol.includes("\\")) {
    const stripped = symbol.replace(/[\\/]/g, "");
    if (!stripped || stripped.includes("..")) throw new UploadError(`代號不能拿來當檔名:${symbol}`);
    return [`${stripped}.csv`];
  }
  return [`${symbol}.csv`];
}

function latestClose(
  csv: string,
  columns: ColumnMap | undefined,
  dateOnly: DateOnlyRule,
  zone: ClockZone,
): { close: number; asOf: string } | null {
  let best: { close: number; asOf: string; t: number } | null = null;
  for (const row of parseCsv(csv)) {
    const closeRaw = cell(row, ["close", "c", "last_close", "last"], columns?.close ?? columns?.last_close);
    const dateRaw = cell(row, ["date", "timestamp", "time", "datetime"], columns?.date);
    if (closeRaw === undefined) continue;
    const close = parseNumber(closeRaw, "close");
    const asOf = dateRaw ? parseTime(dateRaw, dateOnly, zone) : null;
    if (!asOf) continue;
    const t = Date.parse(asOf);
    if (!best || t >= best.t) best = { close, asOf, t };
  }
  return best ? { close: best.close, asOf: best.asOf } : null;
}

function findOhlc(
  io: Io,
  dir: string,
  symbol: string,
  columns: ColumnMap | undefined,
  dateOnly: DateOnlyRule,
  zone: ClockZone,
): { close: number; asOf: string } | null {
  const hits = ohlcNames(symbol)
    .map((name) => path.join(dir, name))
    .filter((file) => io.exists(file));
  if (hits.length > 1) throw new UploadError(`${symbol} 對到超過一個 OHLC 檔`);
  if (hits.length === 0) return null;
  const bar = latestClose(io.read(hits[0]), columns, dateOnly, zone);
  if (!bar) throw new UploadError(`${symbol} 的 OHLC 檔沒有可用的日期與收盤價`);
  return bar;
}

const STATUS_MAP: Record<string, "ok" | "warn" | "stop"> = {
  ok: "ok",
  warn: "warn",
  stop: "stop",
  draft: "warn",
  partial: "warn",
  error: "stop",
};

/** 報告 frontmatter 的 status → aiwr 的 ok/warn/stop。對不到就報錯,不猜成 ok。 */
export function mapReportStatus(raw: string): { status: "ok" | "warn" | "stop"; note?: string } {
  const key = raw.trim().toLowerCase();
  const status = STATUS_MAP[key];
  if (!status) throw new UploadError(`報告 status 只能是 ok、draft、partial、error(收到 ${raw})`);
  if (key === "ok") return { status };
  return { status, note: `來源狀態:${key}` };
}

export function parseFrontmatter(md: string): { data: Record<string, string>; body: string } {
  const text = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) throw new UploadError("報告開頭要是 --- 的 YAML frontmatter");
  const end = text.indexOf("\n---", 4);
  if (end < 0) throw new UploadError("報告的 frontmatter 沒有結束的 ---");
  const raw = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, "");
  const data: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!match) throw new UploadError(`frontmatter 無法解析這一行:${line}`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[match[1]] = value;
  }
  return { data, body };
}

/** 報告只產生 bot_status 與 summary。bot 名稱以設定為準;和 producer 不同就報錯。 */
export function mapReportMarkdown(md: string, botFromConfig?: string): Draft {
  const { data, body } = parseFrontmatter(md);
  const producer = data.producer?.trim();
  const bot = botFromConfig || producer;
  if (!bot) throw new UploadError("報告沒有 producer,設定裡也沒有 bot 名稱");
  if (botFromConfig && producer && producer !== botFromConfig) {
    throw new UploadError(`報告 producer 是「${producer}」,設定的 bot 是「${botFromConfig}」`);
  }
  if (!data.generated_at) throw new UploadError(`${bot} 的報告缺少 generated_at`);
  if (!data.data_as_of) throw new UploadError(`${bot} 的報告缺少 data_as_of(不會拿 generated_at 來補)`);
  if (!data.status) throw new UploadError(`${bot} 的報告缺少 status`);
  const generated_at = parseTime(data.generated_at, "tw_close", "Asia/Taipei");
  const as_of = parseTime(data.data_as_of, "tw_close", "Asia/Taipei");
  const mapped = mapReportStatus(data.status);
  const extra = data.note?.trim();
  const note = [mapped.note, extra].filter(Boolean).join(";");
  if (note.length > 300) throw new UploadError(`${bot} 的狀態備註超過 300 字`);
  const text = body.trim();
  if (text.length > 1000) throw new UploadError(`${bot} 的摘要超過 1000 字`);
  return {
    bot,
    generated_at,
    fromReport: true,
    bot_status: {
      status: mapped.status,
      last_run_at: generated_at,
      as_of,
      ...(note ? { note } : {}),
    },
    ...(text ? { summary: { text, as_of } } : {}),
    warnings: [],
    hashes: [],
  };
}

function ledgerPrice(
  pos: Record<string, unknown>,
  dateOnly: DateOnlyRule,
  zone: ClockZone,
): { price: number; asOf: string | null } | null {
  const raw = pickField(pos, ["last_price", "mark", "mark_price", "price"]);
  if (raw === undefined) return null;
  const timeRaw = pickField(pos, ["price_as_of", "price_time", "mark_time"]);
  const asOf = typeof timeRaw === "string" && timeRaw.trim() ? parseTime(timeRaw, dateOnly, zone) : null;
  return { price: asNumber(raw, "last_price"), asOf };
}

function mapCrypto(source: CryptoSource, configDir: string, io: Io, wm: Watermark): Draft[] {
  const root = path.resolve(configDir, source.root);
  const drafts: Draft[] = [];
  const items: NonNullable<Report["strategies"]>["items"] = [];
  const metricTimes: string[] = [];
  const warnings: string[] = [];

  for (const strategy of source.strategies) {
    if (!strategy.ledger) throw new UploadError(`${strategy.name} 缺少 ledger`);
    const bot = subBot(source.parent_bot, strategy.name);
    const ledger = readJsonObject(mustRead(io, resolveInside(root, strategy.ledger), "帳本"), bot);
    const keys = source.ledger_keys;
    const asOfRaw = pickField(ledger, [keys?.as_of, "as_of", "updated_at", "timestamp", "time"].filter(Boolean) as string[]);
    if (typeof asOfRaw !== "string") throw new UploadError(`${bot} 帳本缺少 as_of`);
    const asOf = parseTime(asOfRaw, "utc_midnight", "UTC");
    const positionsKey = keys?.positions ?? "positions";
    const rawPositions = pickField(ledger, [positionsKey, "positions", "holdings", "open_positions"]);
    if (!Array.isArray(rawPositions)) throw new UploadError(`${bot} 帳本缺少 positions(空倉請寫 [])`);

    const ohlcDir = strategy.ohlc_dir ? resolveInside(root, strategy.ohlc_dir) : undefined;
    const posItems: PosItem[] = [];
    for (const entry of rawPositions) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new UploadError(`${bot} 的持倉必須是物件`);
      const pos = entry as Record<string, unknown>;
      const symbol = asString(pickField(pos, ["symbol", "pair", "ticker"]) ?? "", "symbol");
      checkSymbol(symbol);
      const qty = asNumber(pickField(pos, ["qty", "quantity", "size"]) ?? undefined, "qty");
      const avg = asNumber(pickField(pos, ["avg_cost", "avg_entry", "entry_price", "average_price"]) ?? undefined, "avg_cost");
      if (qty < 0 || avg < 0) throw new UploadError(`${bot} ${symbol} 的數量或成本是負的`);
      if (qty === 0) {
        warnings.push(`${bot} ${symbol} 數量是 0,略過這筆`);
        continue;
      }
      const fileCcy = pickField(pos, ["currency"]);
      if (typeof fileCcy === "string") checkCurrency(fileCcy, source.currency, symbol);
      let last_price: number | null = null;
      let price_as_of: string | null = null;
      const bar = ohlcDir ? findOhlc(io, ohlcDir, symbol, source.columns, "utc_midnight", "UTC") : null;
      if (bar) {
        last_price = bar.close;
        price_as_of = bar.asOf;
      } else {
        const marked = ledgerPrice(pos, "utc_midnight", "UTC");
        if (marked) {
          last_price = marked.price;
          price_as_of = marked.asOf;
          if (!marked.asOf) warnings.push(`${bot} ${symbol} 帳本有價格但沒有價格時間,price_as_of 送 null`);
        } else warnings.push(`${bot} ${symbol} 沒有 OHLC 也沒有帳本價格,現價送 null`);
      }
      const nameRaw = pickField(pos, ["name"]);
      const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
      if (name.length > 40) throw new UploadError(`${bot} ${symbol} 的名稱超過 40 字`);
      posItems.push({
        market: "CRYPTO",
        symbol,
        ...(name ? { name } : {}),
        qty,
        avg_cost: avg,
        last_price,
        currency: source.currency,
        price_as_of,
      });
    }
    posItems.sort((a, b) => a.symbol.localeCompare(b.symbol));

    let snaps: Snap[] = [];
    if (strategy.equity_daily) {
      snaps = readEquity(
        mustRead(io, resolveInside(root, strategy.equity_daily), "權益"),
        "paper",
        "CRYPTO",
        source.currency,
        "utc_midnight",
        "UTC",
        source.columns,
      );
    }
    snaps = trimSnaps(snaps, bot, warnings);
    if (snaps.length === 0) {
      const eqRaw = pickField(ledger, [keys?.equity, "equity", "equity_value", "total_equity"].filter(Boolean) as string[]);
      const cashRaw = pickField(ledger, [keys?.cash, "cash", "quote_cash", "quote_balance"].filter(Boolean) as string[]);
      if (eqRaw !== undefined) {
        const cash = cashRaw === undefined ? undefined : asNumber(cashRaw, "cash");
        snaps = [
          {
            account: "paper",
            market: "CRYPTO",
            currency: source.currency,
            equity: asNumber(eqRaw, "equity"),
            ...(cash !== undefined ? { cash } : {}),
            as_of: asOf,
          },
        ];
      }
    } else {
      const eqRaw = pickField(ledger, [keys?.equity, "equity"].filter(Boolean) as string[]);
      if (typeof eqRaw === "number" && eqRaw !== snaps[snaps.length - 1].equity) {
        warnings.push(`${bot} 帳本 equity 和權益 CSV 最後一列不同,以 CSV 為準`);
      }
    }

    const sent = new Set(wm.sent[bot] ?? []);
    const tradeResult = strategy.trades
      ? mapTrades({
          csv: mustRead(io, resolveInside(root, strategy.trades), "交易"),
          bot,
          account: "paper",
          market: "CRYPTO",
          currency: source.currency,
          dateOnly: "utc_midnight",
          zone: "UTC",
          columns: source.columns,
          sent,
        })
      : { trades: [], hashes: [], count: null as number | null, times: [] as string[] };

    const series = snaps.map((snap) => snap.equity);
    items.push(
      strategyItem(
        strategy.name,
        "CRYPTO",
        snaps.length ? snaps[snaps.length - 1].equity : null,
        series,
        strategy.trades ? tradeResult.count : null,
        source.start_capital,
      ),
    );
    metricTimes.push(asOf, ...snaps.map((snap) => snap.as_of));

    const times = [asOf, ...posItems.flatMap((item) => (item.price_as_of ? [item.price_as_of] : [])), ...snaps.map((s) => s.as_of), ...tradeResult.times];
    drafts.push({
      bot,
      generated_at: maxIso(times),
      positions: [{ account: "paper", as_of: asOf, items: posItems }],
      ...(snaps.length ? { equity_snapshots: snaps } : {}),
      ...(tradeResult.trades.length ? { trades: tradeResult.trades } : {}),
      warnings: [...warnings],
      hashes: tradeResult.hashes,
    });
    warnings.length = 0;
  }

  drafts.push({
    bot: source.parent_bot,
    generated_at: maxIso(metricTimes),
    strategies: { as_of: maxIso(metricTimes), items: items.sort((a, b) => a.name.localeCompare(b.name)) },
    warnings: [],
    hashes: [],
  });

  if (source.report) {
    drafts.push(mapReportMarkdown(mustRead(io, resolveInside(root, source.report), "報告"), source.parent_bot));
  }
  return drafts;
}

function mapTwPaper(source: TwPaperSource, configDir: string, io: Io, wm: Watermark): Draft[] {
  const root = path.resolve(configDir, source.root);
  const drafts: Draft[] = [];
  const items: NonNullable<Report["strategies"]>["items"] = [];
  const metricTimes: string[] = [];

  for (const strategy of source.strategies) {
    if (!strategy.positions) throw new UploadError(`${strategy.name} 缺少 positions`);
    const bot = subBot(source.parent_bot, strategy.name);
    const warnings: string[] = [];
    const rows = parseCsv(mustRead(io, resolveInside(root, strategy.positions), "持股"));
    if (rows.length === 0) throw new UploadError(`${bot} 持股檔沒有資料列。空白檔不會被當成空倉。`);
    const posItems: PosItem[] = [];
    const asOfs: string[] = [];
    let mixedDates = false;
    for (const row of rows) {
      const symbol = cell(row, ["symbol", "ticker", "代號"], source.columns?.symbol);
      const qtyRaw = cell(row, ["qty", "quantity", "shares", "股數"], source.columns?.qty);
      const costRaw = cell(row, ["avg_cost", "unit_cost", "cost_price", "成本"], source.columns?.avg_cost);
      const dateRaw = cell(row, ["as_of", "date", "snapshot_date"], source.columns?.date);
      if (!symbol || qtyRaw === undefined || costRaw === undefined || !dateRaw) {
        throw new UploadError(`${bot} 持股列缺少代號、數量、成本或日期`);
      }
      checkSymbol(symbol);
      checkCurrency(cell(row, ["currency"]), source.currency, symbol);
      const qty = parseNumber(qtyRaw, "qty");
      const avg = parseNumber(costRaw, "avg_cost");
      if (qty < 0 || avg < 0) throw new UploadError(`${bot} ${symbol} 的數量或成本是負的`);
      const rowAsOf = parseTime(dateRaw, "tw_close", "Asia/Taipei");
      if (asOfs.length > 0 && rowAsOf !== asOfs[0]) mixedDates = true;
      asOfs.push(rowAsOf);
      if (qty === 0) {
        warnings.push(`${bot} ${symbol} 數量是 0,略過`);
        continue;
      }
      const closeRaw = cell(row, ["last_close", "close", "last_price", "price"], source.columns?.last_close);
      const priceDateRaw = cell(row, ["price_as_of", "price_date", "close_date"], source.columns?.price_date);
      const last_price = closeRaw === undefined ? null : parseNumber(closeRaw, "last_close");
      const price_as_of = priceDateRaw === undefined ? null : parseTime(priceDateRaw, "tw_close", "Asia/Taipei");
      if (last_price !== null && price_as_of === null) warnings.push(`${bot} ${symbol} 有現價但沒有價格日期,price_as_of 送 null`);
      const name = cell(row, ["name", "名稱"], source.columns?.name);
      if (name && name.length > 40) throw new UploadError(`${bot} ${symbol} 的名稱超過 40 字`);
      posItems.push({
        market: "TW",
        symbol,
        ...(name ? { name } : {}),
        qty,
        avg_cost: avg,
        last_price,
        currency: source.currency,
        price_as_of,
      });
    }
    if (mixedDates) warnings.push(`${bot} 持股列的日期不一致,as_of 用最晚的一筆;各筆價格時間仍分開`);
    const asOf = maxIso(asOfs);
    posItems.sort((a, b) => a.symbol.localeCompare(b.symbol));

    let snaps: Snap[] = [];
    if (strategy.equity) {
      snaps = trimSnaps(
        readEquity(mustRead(io, resolveInside(root, strategy.equity), "權益"), "paper", "TW", source.currency, "tw_close", "Asia/Taipei", source.columns),
        bot,
        warnings,
      );
    }
    const sent = new Set(wm.sent[bot] ?? []);
    const tradeResult = strategy.trades
      ? mapTrades({
          csv: mustRead(io, resolveInside(root, strategy.trades), "交易"),
          bot,
          account: "paper",
          market: "TW",
          currency: source.currency,
          dateOnly: "tw_close",
          zone: "Asia/Taipei",
          columns: source.columns,
          sent,
        })
      : { trades: [] as Trade[], hashes: [] as string[], count: null as number | null, times: [] as string[] };

    const series = snaps.map((snap) => snap.equity);
    items.push(strategyItem(strategy.name, "TW", snaps.length ? snaps[snaps.length - 1].equity : null, series, strategy.trades ? tradeResult.count : null, source.start_capital));
    metricTimes.push(asOf, ...snaps.map((snap) => snap.as_of));
    const times = [asOf, ...posItems.flatMap((item) => (item.price_as_of ? [item.price_as_of] : [])), ...snaps.map((s) => s.as_of), ...tradeResult.times];
    drafts.push({
      bot,
      generated_at: maxIso(times),
      positions: [{ account: "paper", as_of: asOf, items: posItems }],
      ...(snaps.length ? { equity_snapshots: snaps } : {}),
      ...(tradeResult.trades.length ? { trades: tradeResult.trades } : {}),
      warnings,
      hashes: tradeResult.hashes,
    });
  }

  drafts.push({
    bot: source.parent_bot,
    generated_at: maxIso(metricTimes),
    strategies: { as_of: maxIso(metricTimes), items: items.sort((a, b) => a.name.localeCompare(b.name)) },
    warnings: [],
    hashes: [],
  });
  if (source.report) drafts.push(mapReportMarkdown(mustRead(io, resolveInside(root, source.report), "報告"), source.parent_bot));
  return drafts;
}

function averageCost(
  row: Record<string, string>,
  qty: number,
  symbol: string,
  costMeans: "unit" | "total",
  columns?: ColumnMap,
): number {
  // 有指定欄名時,那個欄就是成本數字,再照 cost_means 解讀(unit 單價 / total 總成本)。
  if (columns?.avg_cost) {
    const raw = cell(row, [columns.avg_cost], columns.avg_cost);
    if (raw === undefined) throw new UploadError(`${symbol} 缺少成本欄 ${columns.avg_cost}`);
    const cost = parseNumber(raw, "cost");
    if (costMeans === "total") {
      if (!(qty > 0)) throw new UploadError(`${symbol} 數量是 0,無法把總成本換算成單價`);
      return cost / qty;
    }
    return cost;
  }
  const unitRaw = cell(row, ["avg_cost", "unit_cost", "cost_price"]);
  if (unitRaw !== undefined) return parseNumber(unitRaw, "avg_cost");
  const costRaw = cell(row, ["cost", "成本"]);
  if (costRaw === undefined) throw new UploadError(`${symbol} 缺少成本`);
  const cost = parseNumber(costRaw, "cost");
  if (costMeans === "total") {
    if (!(qty > 0)) throw new UploadError(`${symbol} 數量是 0,無法把總成本換算成單價`);
    return cost / qty;
  }
  return cost;
}

function mapTwReal(source: TwRealSource, configDir: string, io: Io): Draft[] {
  const root = path.resolve(configDir, source.root);
  const warnings: string[] = [];
  const rows = parseCsv(mustRead(io, resolveInside(root, source.holdings), "持股"));
  if (rows.length === 0) throw new UploadError(`${source.bot} 持股檔沒有資料列`);
  const prices = new Map<string, { close: number; asOf: string | null }>();
  if (source.prices) {
    for (const row of parseCsv(mustRead(io, resolveInside(root, source.prices), "收盤價"))) {
      const symbol = cell(row, ["symbol", "ticker", "代號"], source.columns?.symbol);
      const closeRaw = cell(row, ["close", "last_close", "price", "收盤"], source.columns?.close ?? source.columns?.last_close);
      if (!symbol || closeRaw === undefined) throw new UploadError("價格檔有一列缺少代號或收盤價");
      const dateRaw = cell(row, ["date", "price_date", "as_of"], source.columns?.price_date);
      const asOf = dateRaw ? parseTime(dateRaw, "tw_close", "Asia/Taipei") : null;
      if (!dateRaw) warnings.push(`${symbol} 的收盤價沒有日期,price_as_of 送 null`);
      const prev = prices.get(symbol);
      if (!prev || (asOf && (!prev.asOf || Date.parse(asOf) >= Date.parse(prev.asOf)))) {
        prices.set(symbol, { close: parseNumber(closeRaw, "close"), asOf });
      }
    }
  } else warnings.push(`${source.bot} 沒有價格檔,現價全部送 null`);

  const posItems: PosItem[] = [];
  const costTimes: string[] = [];
  let mixed = false;
  for (const row of rows) {
    const symbol = cell(row, ["symbol", "ticker", "代號"], source.columns?.symbol);
    const qtyRaw = cell(row, ["qty", "quantity", "shares", "股數"], source.columns?.qty);
    const dateRaw = cell(row, ["cost_date", "cost_as_of", "opened_at", "date"], source.columns?.cost_date ?? source.columns?.date);
    if (!symbol || !dateRaw) throw new UploadError(`${source.bot} 持股列缺少代號或成本日期`);
    if (qtyRaw === undefined) {
      throw new UploadError(`${source.bot} 缺少數量欄位(qty / shares / 股數)。不會假設股數。檔頭有:${Object.keys(row).join("、")}`);
    }
    checkSymbol(symbol);
    const qty = parseNumber(qtyRaw, "qty");
    if (qty < 0) throw new UploadError(`${symbol} 的數量是負的`);
    const avg = averageCost(row, qty, symbol, source.cost_means, source.columns);
    if (avg < 0) throw new UploadError(`${symbol} 的成本是負的`);
    const costAsOf = parseTime(dateRaw, "tw_close", "Asia/Taipei");
    if (costTimes.length > 0 && costAsOf !== costTimes[0]) mixed = true;
    costTimes.push(costAsOf);
    if (qty === 0) {
      warnings.push(`${symbol} 數量是 0,略過`);
      continue;
    }
    const quote = prices.get(symbol);
    if (source.prices && !quote) warnings.push(`${symbol} 沒有對到收盤價,現價送 null`);
    const name = cell(row, ["name", "名稱"], source.columns?.name);
    posItems.push({
      market: "TW",
      symbol,
      ...(name ? { name } : {}),
      qty,
      avg_cost: avg,
      last_price: quote ? quote.close : null,
      currency: source.currency,
      price_as_of: quote?.asOf ?? null,
    });
  }
  if (mixed) warnings.push(`${source.bot} 各筆成本日期不同,持股 as_of 用最晚的一筆;價格時間仍用價格檔`);
  posItems.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const asOf = maxIso(costTimes);
  const priceTimes = posItems.flatMap((item) => (item.price_as_of ? [item.price_as_of] : []));
  return [
    {
      bot: source.bot,
      generated_at: maxIso([asOf, ...priceTimes]),
      positions: [{ account: "real", as_of: asOf, items: posItems }],
      warnings,
      hashes: [],
    },
  ];
}

function mapReportSource(source: ReportSource, configDir: string, io: Io): Draft[] {
  const file = path.resolve(configDir, source.file);
  return [mapReportMarkdown(mustRead(io, file, "報告"), source.bot)];
}

function mergeDrafts(list: Draft[]): Draft {
  const bot = list[0].bot;
  const out: Draft = { bot, warnings: [], hashes: [] };
  const reportTimes = list.filter((d) => d.fromReport && d.generated_at).map((d) => d.generated_at!);
  const dataTimes = list.filter((d) => !d.fromReport && d.generated_at).map((d) => d.generated_at!);
  out.generated_at = reportTimes.length ? maxIso(reportTimes) : maxIso(dataTimes);
  out.fromReport = reportTimes.length > 0;
  const keys = ["bot_status", "positions", "trades", "equity_snapshots", "strategies", "summary"] as const;
  for (const draft of list) {
    out.warnings.push(...draft.warnings);
    out.hashes.push(...draft.hashes);
    for (const key of keys) {
      const value = draft[key];
      if (value === undefined) continue;
      if (out[key] !== undefined) throw new UploadError(`bot「${bot}」的 ${key} 有兩個來源,請改設定讓它們落在不同 bot`);
      out[key] = value as never;
    }
  }
  if (!out.generated_at) throw new UploadError(`bot「${bot}」沒有任何時間`);
  return out;
}

function toReport(draft: Draft): Report {
  const report = {
    schema: "aiwr/v1" as const,
    bot: draft.bot,
    generated_at: draft.generated_at!,
    ...(draft.bot_status ? { bot_status: draft.bot_status } : {}),
    ...(draft.positions ? { positions: draft.positions } : {}),
    ...(draft.trades && draft.trades.length > 0 ? { trades: draft.trades } : {}),
    ...(draft.equity_snapshots && draft.equity_snapshots.length > 0 ? { equity_snapshots: draft.equity_snapshots } : {}),
    ...(draft.strategies ? { strategies: draft.strategies } : {}),
    ...(draft.summary ? { summary: draft.summary } : {}),
  };
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(根)"}: ${issue.message}`).join("; ");
    throw new UploadError(`組成的「${draft.bot}」不符合 aiwr/v1:${msg}`);
  }
  return parsed.data;
}

export function buildReports(config: UploadConfig, configDir: string, io: Io, wm: Watermark): BuiltUpload {
  const drafts: Draft[] = [];
  for (const source of config.sources) {
    if (source.type === "crypto_paper") drafts.push(...mapCrypto(source, configDir, io, wm));
    else if (source.type === "tw_paper") drafts.push(...mapTwPaper(source, configDir, io, wm));
    else if (source.type === "tw_real") drafts.push(...mapTwReal(source, configDir, io));
    else drafts.push(...mapReportSource(source, configDir, io));
  }
  const groups = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const list = groups.get(draft.bot) ?? [];
    list.push(draft);
    groups.set(draft.bot, list);
  }
  const merged = [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, "zh-Hant"))
    .map((bot) => mergeDrafts(groups.get(bot)!));
  const hashesByBot: Record<string, string[]> = {};
  for (const draft of merged) {
    if (draft.hashes.length) hashesByBot[draft.bot] = [...new Set(draft.hashes)].sort();
  }
  return {
    reports: merged.map(toReport),
    warnings: merged.flatMap((draft) => draft.warnings),
    hashesByBot,
  };
}
