import type { Account, EquitySeries, Portfolio, Strategy } from "@/lib/types";

/**
 * ⚠️ DEMO 範例資料:代號雖然是真的,但數量、成本、價格、曲線全部是虛構的。
 * 畫面上一律標示「DEMO」。時間依「現在」推算,讓過期判斷有東西可以看。
 */

/** 可重現的假曲線(沿用 v1 的作法) */
function curve(seed: number, drift: number, vol: number, n = 60, start = 100): number[] {
  let v = start;
  let s = seed;
  const out = [v];
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    v = v * (1 + drift + (s / 233280 - 0.5) * vol);
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

/** 把曲線等比例縮放,讓最後一點剛好等於 target(讓 DEMO 的總資產 = 持股市值 + 現金,數字對得起來) */
function endAt(values: number[], target: number): number[] {
  const k = target / values[values.length - 1];
  return values.map((v) => Math.round(v * k * 100) / 100);
}

const DAY = 86_400_000;
const TPE = 8 * 3_600_000;

/** 最近一個已收盤的台股交易日 14:00(台北) */
function lastTwClose(now: Date): Date {
  for (let i = 0; i < 10; i++) {
    const tpeMidnight = Math.floor((now.getTime() + TPE) / DAY) * DAY - TPE - i * DAY;
    const dow = new Date(tpeMidnight + TPE).getUTCDay();
    const close = new Date(tpeMidnight + 14 * 3_600_000);
    if (dow !== 0 && dow !== 6 && close <= now) return close;
  }
  return now;
}

/** 最近一次 UTC 00:30(日線收線後) */
function lastCryptoClose(now: Date): Date {
  const t = Math.floor(now.getTime() / DAY) * DAY + 30 * 60_000;
  return new Date(t <= now.getTime() ? t : t - DAY);
}

function series(
  account: Account,
  bot: string,
  market: "TW" | "CRYPTO",
  currency: string,
  values: number[],
  last: Date,
  cash: number | null,
): EquitySeries {
  return {
    bot,
    account,
    market,
    currency,
    cash,
    points: values.map((equity, i) => ({
      at: new Date(last.getTime() - (values.length - 1 - i) * DAY).toISOString(),
      equity,
    })),
  };
}

export function demoPortfolio(account: Account, now: Date = new Date()): Portfolio {
  const tw = lastTwClose(now).toISOString();
  const cx = lastCryptoClose(now).toISOString();
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  if (account === "real") {
    return {
      account,
      positions: {
        isDemo: true,
        data: [
          { bot: "股市日報", account, market: "TW", symbol: "0050", name: "元大台灣50", qty: 2000, avgCost: 180.5, lastPrice: 196.2, currency: "TWD", priceAsOf: tw, asOf: tw },
          { bot: "股市日報", account, market: "TW", symbol: "2330", name: "台積電", qty: 100, avgCost: 1020, lastPrice: 985, currency: "TWD", priceAsOf: tw, asOf: tw },
          { bot: "幣圈情報員", account, market: "CRYPTO", symbol: "BTC", qty: 0.12, avgCost: 61000, lastPrice: 68250.5, currency: "USDT", priceAsOf: cx, asOf: cx },
          { bot: "幣圈情報員", account, market: "CRYPTO", symbol: "ETH", qty: 1.5, avgCost: 3300, lastPrice: null, currency: "USDT", priceAsOf: null, asOf: cx },
        ],
      },
      equity: {
        isDemo: true,
        data: [
          series(account, "股市日報", "TW", "TWD", endAt(curve(7, 0.0012, 0.02, 60), 2000 * 196.2 + 100 * 985 + 52000), new Date(tw), 52000),
          // ETH 沒有現價 → 總資產只含有報價的部位 + 現金
          series(account, "幣圈情報員", "CRYPTO", "USDT", endAt(curve(19, 0.001, 0.05, 60), 0.12 * 68250.5 + 1800), new Date(cx), 1800),
        ],
      },
      summaries: {
        isDemo: true,
        data: [
          { bot: "股市日報", text: "DEMO:今日大盤小漲,持股無異動。", asOf: tw },
          { bot: "幣圈情報員", text: "DEMO:BTC 日線收在均線上方;ETH 報價來源暫時讀不到。", asOf: cx },
        ],
      },
      fx: {
        isDemo: true,
        data: [{ base: "USDT", quote: "TWD", rate: 32.1, asOf: ago(5), source: "DEMO" }],
      },
    };
  }

  const p = ago(2);
  const strategies: Strategy[] = [
    { bot: "程式交易", name: "RSI 背離", market: "BTC", returnPct: 18.4, maxDrawdownPct: -12.1, trades: 64, oosReturnPct: null, curve: curve(11, 0.004, 0.05, 40), asOf: p },
    { bot: "程式交易", name: "SMA60/EMA676 回拉", market: "BTC", returnPct: -3.2, maxDrawdownPct: -21.5, trades: 38, oosReturnPct: -5.0, oosPeriod: "DEMO 2025 H2", curve: curve(23, -0.001, 0.05, 40), asOf: p },
    { bot: "程式交易", name: "Vegas 通道", market: "ETH", returnPct: 9.7, maxDrawdownPct: -15.3, trades: 52, oosReturnPct: 4.1, oosPeriod: "DEMO 2025 H2", curve: curve(37, 0.002, 0.05, 40), asOf: p },
    { bot: "台股模擬交易室", name: "趨勢均線", market: "台股", returnPct: 0.8, maxDrawdownPct: -1.9, trades: null, oosReturnPct: null, curve: curve(41, 0.0005, 0.02, 40), asOf: ago(30) },
  ];

  return {
    account,
    positions: {
      isDemo: true,
      data: [
        { bot: "台股模擬交易室", account, market: "TW", symbol: "2317", name: "鴻海", qty: 3000, avgCost: 205, lastPrice: 212.5, currency: "TWD", priceAsOf: p, asOf: p },
        { bot: "台股模擬交易室", account, market: "TW", symbol: "00878", name: "國泰永續高股息", qty: 5000, avgCost: 22.4, lastPrice: 21.9, currency: "TWD", priceAsOf: p, asOf: p },
        { bot: "模擬交易室", account, market: "CRYPTO", symbol: "SOL", qty: 40, avgCost: 150, lastPrice: 171.3, currency: "USDT", priceAsOf: p, asOf: p },
      ],
    },
    equity: {
      isDemo: true,
      data: [
        series(account, "台股模擬交易室", "TW", "TWD", endAt(curve(5, 0.0008, 0.015, 60), 3000 * 212.5 + 5000 * 21.9 + 280000), new Date(p), 280000),
        series(account, "模擬交易室", "CRYPTO", "USDT", endAt(curve(29, 0.0015, 0.04, 60), 40 * 171.3 + 3150), new Date(p), 3150),
      ],
    },
    summaries: {
      isDemo: true,
      data: [
        { bot: "台股模擬交易室", text: "DEMO:今日加碼鴻海 1 張,00878 續抱。", asOf: p },
        { bot: "模擬交易室", text: "DEMO:SOL 突破訊號進場,停損設 140。", asOf: p },
      ],
    },
    fx: { isDemo: true, data: [] },
    strategies: { isDemo: true, data: strategies },
  };
}
