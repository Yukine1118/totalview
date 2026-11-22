import type { z } from "zod";
import { latestManual } from "@/lib/usage/adapters/manual";
import { AI_SERVICES } from "@/lib/usage/types";
import type {
  botStatusSchema,
  equitySchema,
  fxSchema,
  positionsSchema,
  strategiesSchema,
  summarySchema,
} from "@/lib/import/schema";
import type {
  Account,
  AiUsage,
  BotStatus,
  BotSummary,
  EquitySeries,
  FxRate,
  Market,
  Position,
  Strategy,
} from "@/lib/types";

/**
 * 把資料庫的 items(JSON 匯入的原始內容)轉成畫面用的型別。純函式,有單元測試。
 * 這裡「只轉換,不補資料」:缺的就是缺,畫面會顯示「無資料」。
 */

type Item = { bot: string; kind: string; key: string; as_of: string; payload: unknown };

const latestFirst = (a: Item, b: Item) => new Date(b.as_of).getTime() - new Date(a.as_of).getTime();

/** AI 用量:四個服務都在,沒有資料就是 null(實際讀取邏輯在 lib/usage 的 adapter) */
export function toAiUsage(items: Item[]): AiUsage[] {
  return AI_SERVICES.map((service) => latestManual(service, items));
}

export function toBotStatuses(items: Item[]): BotStatus[] {
  return items
    .filter((i) => i.kind === "bot_status")
    .map((i) => {
      const p = i.payload as z.infer<typeof botStatusSchema>;
      return { bot: i.bot, status: p.status, lastRunAt: p.last_run_at, note: p.note, asOf: p.as_of };
    })
    .sort((a, b) => a.bot.localeCompare(b.bot, "zh-Hant"));
}

export function toPositions(items: Item[], account: Account): Position[] {
  const kind = account === "real" ? "positions_real" : "positions_paper";
  return items
    .filter((i) => i.kind === kind)
    .flatMap((i) => {
      const p = i.payload as z.infer<typeof positionsSchema>;
      return p.items.map<Position>((x) => ({
        bot: i.bot,
        account,
        market: x.market,
        symbol: x.symbol,
        name: x.name,
        qty: x.qty,
        avgCost: x.avg_cost,
        lastPrice: x.last_price,
        currency: x.currency,
        priceAsOf: x.price_as_of,
        asOf: p.as_of,
      }));
    });
}

/** 資產曲線:同一個 bot + 市場 + 幣別一條線;同一時間點重複時,以後匯入的為準 */
export function toEquitySeries(history: Item[], account: Account): EquitySeries[] {
  const groups = new Map<string, { bot: string; market: Market; currency: string; byTime: Map<string, { equity: number; cash: number | null }> }>();
  for (const i of history) {
    if (i.kind !== "equity") continue;
    const p = i.payload as z.infer<typeof equitySchema>;
    if (p.account !== account) continue;
    const k = `${i.bot}|${p.market}|${p.currency}`;
    const g = groups.get(k) ?? { bot: i.bot, market: p.market, currency: p.currency, byTime: new Map() };
    g.byTime.set(new Date(p.as_of).toISOString(), { equity: p.equity, cash: p.cash ?? null });
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => {
    const points = [...g.byTime.entries()].sort(([a], [b]) => a.localeCompare(b));
    return {
      bot: g.bot,
      account,
      market: g.market,
      currency: g.currency,
      points: points.map(([at, v]) => ({ at, equity: v.equity })),
      cash: points.length ? points[points.length - 1][1].cash : null,
    };
  });
}

export function toSummaries(items: Item[], bots: Set<string>): BotSummary[] {
  return items
    .filter((i) => i.kind === "summary" && bots.has(i.bot))
    .map((i) => {
      const p = i.payload as z.infer<typeof summarySchema>;
      return { bot: i.bot, text: p.text, asOf: p.as_of };
    });
}

export function toStrategies(items: Item[]): Strategy[] {
  return items
    .filter((i) => i.kind === "strategies")
    .flatMap((i) => {
      const p = i.payload as z.infer<typeof strategiesSchema>;
      return p.items.map<Strategy>((s) => ({
        bot: i.bot,
        name: s.name,
        market: s.market,
        returnPct: s.return_pct,
        maxDrawdownPct: s.max_drawdown_pct,
        trades: s.trades,
        oosReturnPct: s.oos_return_pct,
        oosPeriod: s.oos_period,
        curve: s.curve ?? [],
        asOf: p.as_of,
      }));
    });
}

/** 匯率:同一組幣別取資料時間最新的一筆 */
export function toFx(items: Item[]): FxRate[] {
  const best = new Map<string, Item>();
  for (const i of items.filter((x) => x.kind === "fx")) {
    const cur = best.get(i.key);
    if (!cur || latestFirst(i, cur) < 0) best.set(i.key, i);
  }
  return [...best.values()].map((i) => {
    const p = i.payload as z.infer<typeof fxSchema>;
    return { base: p.base, quote: p.quote, rate: p.rate, asOf: p.as_of, source: p.source };
  });
}

/** 哪些 bot 跟這個帳戶有關(有持股或資產快照) */
export function botsForAccount(current: Item[], history: Item[], account: Account): Set<string> {
  const set = new Set<string>();
  const kind = account === "real" ? "positions_real" : "positions_paper";
  for (const i of current) if (i.kind === kind) set.add(i.bot);
  for (const i of history) {
    if (i.kind === "equity" && (i.payload as { account?: string }).account === account) set.add(i.bot);
  }
  if (account === "paper") for (const i of current) if (i.kind === "strategies") set.add(i.bot);
  return set;
}
