import type { FxRate, Position } from "@/lib/types";

/** 單一持股的計算結果。現價缺漏時,市值與損益都是 null(不猜)。 */
export type PositionCalc = {
  cost: number;
  marketValue: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
};

export function calcPosition(p: Position): PositionCalc {
  const cost = p.qty * p.avgCost;
  if (p.lastPrice == null || !Number.isFinite(p.lastPrice)) {
    return { cost, marketValue: null, unrealized: null, unrealizedPct: null };
  }
  const marketValue = p.qty * p.lastPrice;
  const unrealized = marketValue - cost;
  return { cost, marketValue, unrealized, unrealizedPct: cost !== 0 ? (unrealized / cost) * 100 : null };
}

export type CurrencyTotal = {
  currency: string;
  cost: number;
  /** 有報價的部位市值合計 */
  marketValue: number;
  unrealized: number;
  /** 有幾檔沒有現價(沒算進市值與損益) */
  missingPrice: number;
};

/** 依幣別加總;不同幣別絕不直接相加 */
export function totalsByCurrency(positions: Position[]): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const p of positions) {
    const t = map.get(p.currency) ?? { currency: p.currency, cost: 0, marketValue: 0, unrealized: 0, missingPrice: 0 };
    const c = calcPosition(p);
    if (c.marketValue == null) {
      t.missingPrice += 1;
    } else {
      t.cost += c.cost;
      t.marketValue += c.marketValue;
      t.unrealized += c.unrealized!;
    }
    map.set(p.currency, t);
  }
  return [...map.values()];
}

/**
 * 換算成目標幣別。只用「有提供」的匯率(base→quote 或反向);找不到就回 null,不猜。
 * 同幣別直接回傳。
 */
export function convert(amount: number, from: string, to: string, rates: FxRate[]): number | null {
  if (from === to) return amount;
  const direct = rates.find((r) => r.base === from && r.quote === to && r.rate > 0);
  if (direct) return amount * direct.rate;
  const inverse = rates.find((r) => r.base === to && r.quote === from && r.rate > 0);
  if (inverse) return amount / inverse.rate;
  return null;
}

export function findRate(from: string, to: string, rates: FxRate[]): FxRate | null {
  return (
    rates.find((r) => r.base === from && r.quote === to) ?? rates.find((r) => r.base === to && r.quote === from) ?? null
  );
}

/** 從曲線算最大回撤(%),給沒有回報 MDD 時參考用 */
export function maxDrawdownPct(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0];
  let mdd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) mdd = Math.min(mdd, ((v - peak) / peak) * 100);
  }
  return mdd;
}

// ───── 顯示格式 ─────

const DECIMALS: Record<string, number> = { TWD: 0 };

export function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const d = DECIMALS[currency] ?? 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** 單價:台幣最多 2 位小數,其他幣別 2–6 位(不四捨五入成整數,避免看錯成本) */
export function fmtPrice(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return currency === "TWD"
    ? n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function fmtQty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${signed && n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtSigned(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${fmtMoney(n, currency)}`;
}

/** 正負號顏色 class */
export function signClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "";
  return n > 0 ? "text-ok" : "text-stop";
}
