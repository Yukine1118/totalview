import { FRESHNESS, TW_MARKET_HOLIDAYS, type FreshnessRule } from "@/config/freshness";
import { evaluateFreshness } from "@/lib/freshness";
import {
  calcPosition,
  convert,
  findRate,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtQty,
  fmtSigned,
  signClass,
  totalsByCurrency,
} from "@/lib/portfolio";
import type { Account, Market, Portfolio, Position } from "@/lib/types";
import { DataTime, Section } from "@/components/DataTime";
import { EquityChart } from "@/components/charts";
import { StrategyTable } from "./StrategyTable";

const MARKET_LABEL: Record<Market, string> = { TW: "台股", CRYPTO: "加密貨幣" };

/** 真實部位用盤後規則;模擬部位跟著 bot 排程 */
export function ruleFor(account: Account, market: Market): FreshnessRule {
  return account === "real" ? FRESHNESS.realPositions[market] : FRESHNESS.paper;
}

function fresh(account: Account, market: Market, asOf: string | null, now: Date) {
  return evaluateFreshness(asOf, ruleFor(account, market), now, TW_MARKET_HOLIDAYS);
}

export function PortfolioView({ portfolio, now }: { portfolio: Portfolio; now: Date }) {
  const { account, positions, equity, summaries, fx, strategies } = portfolio;
  const markets = (["TW", "CRYPTO"] as const).filter((m) => positions.data.some((p) => p.market === m));

  return (
    <>
      <TotalsSection portfolio={portfolio} now={now} />

      <Section title="持股明細" isDemo={positions.isDemo}>
        {markets.length === 0 ? (
          <p className="rounded-[10px] border border-border bg-card px-4 py-3.5 text-sm text-muted">無資料</p>
        ) : (
          <div className="flex flex-col gap-4">
            {markets.map((m) => (
              <PositionsGroup key={m} market={m} account={account} items={positions.data.filter((p) => p.market === m)} now={now} />
            ))}
          </div>
        )}
      </Section>

      <Section title="資產曲線" isDemo={equity.isDemo}>
        {equity.data.length === 0 ? (
          <p className="rounded-[10px] border border-border bg-card px-4 py-3.5 text-sm text-muted">無資料</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {equity.data.map((s) => {
              const last = s.points[s.points.length - 1];
              const first = s.points[0];
              const chg = first && last && first.equity ? ((last.equity - first.equity) / first.equity) * 100 : null;
              return (
                <article key={`${s.bot}-${s.currency}`} className="rounded-[10px] border border-border bg-card px-4 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-bold">
                      {MARKET_LABEL[s.market]} <span className="text-sm font-normal text-muted">· {s.currency} · {s.bot}</span>
                    </span>
                    <span className={`num text-sm ${signClass(chg)}`}>{fmtPct(chg)}</span>
                  </div>
                  <EquityChart points={s.points} currency={s.currency} label={`${MARKET_LABEL[s.market]}資產曲線`} />
                  <div className="mt-1">
                    <DataTime fresh={fresh(account, s.market, last?.at ?? null, now)} now={now} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      {strategies && (
        <Section title="策略績效" isDemo={strategies.isDemo}>
          <StrategyTable items={strategies.data} now={now} />
        </Section>
      )}

      <Section title="bot 最新摘要" isDemo={summaries.isDemo}>
        {summaries.data.length === 0 ? (
          <p className="rounded-[10px] border border-border bg-card px-4 py-3.5 text-sm text-muted">無資料</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summaries.data.map((s) => (
              <li key={s.bot} className="rounded-[10px] border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{s.bot}</span>
                  <DataTime fresh={evaluateFreshness(s.asOf, FRESHNESS.botStatus.default, now)} now={now} />
                </div>
                <p className="mt-1 text-sm">{s.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {fx.data.length > 0 && (
        <p className="text-xs text-muted">
          匯率:
          {fx.data.map((r) => (
            <span key={`${r.base}${r.quote}`} className="ml-1">
              1 {r.base} = <span className="num">{r.rate}</span> {r.quote}(來源:{r.source}
              {fx.isDemo && r.source !== "DEMO" ? ",DEMO" : ""})
            </span>
          ))}
        </p>
      )}
    </>
  );
}

/** 總資產:依幣別分開;有匯率才換算成台幣合計 */
function TotalsSection({ portfolio, now }: { portfolio: Portfolio; now: Date }) {
  const { account, positions, equity, fx } = portfolio;
  const totals = totalsByCurrency(positions.data);
  const currencies = [...new Set([...equity.data.map((s) => s.currency), ...totals.map((t) => t.currency)])];

  const rows = currencies.map((cur) => {
    const series = equity.data.find((s) => s.currency === cur);
    const last = series?.points[series.points.length - 1] ?? null;
    const t = totals.find((x) => x.currency === cur);
    const market = series?.market ?? positions.data.find((p) => p.currency === cur)?.market ?? "TW";
    return { cur, market, equity: last?.equity ?? null, equityAt: last?.at ?? null, cash: series?.cash ?? null, t };
  });

  // 換算台幣合計:每個幣別都要有總資產和匯率,缺一個就不算
  const converted = rows.map((r) => (r.equity == null ? null : convert(r.equity, r.cur, "TWD", fx.data)));
  const canSum = rows.length > 0 && converted.every((v) => v != null);
  const sumTwd = canSum ? converted.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
  const missingFx = rows.filter((r) => r.cur !== "TWD" && !findRate(r.cur, "TWD", fx.data)).map((r) => r.cur);

  return (
    <Section title="總資產" isDemo={equity.isDemo || positions.isDemo}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <article key={r.cur} className="rounded-[10px] border border-border bg-card px-4 py-3.5" data-currency={r.cur}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{MARKET_LABEL[r.market]}</span>
              <span className="text-sm text-muted">{r.cur}</span>
            </div>
            <div className="num mt-1 text-[1.7rem] font-semibold">{r.equity == null ? "無資料" : fmtMoney(r.equity, r.cur)}</div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <dt className="text-muted">持股市值</dt>
              <dd className="num text-right">{r.t ? fmtMoney(r.t.marketValue, r.cur) : "—"}</dd>
              <dt className="text-muted">現金</dt>
              <dd className="num text-right">{fmtMoney(r.cash, r.cur)}</dd>
              <dt className="text-muted">未實現損益</dt>
              <dd className={`num text-right ${signClass(r.t?.unrealized)}`}>{r.t ? fmtSigned(r.t.unrealized, r.cur) : "—"}</dd>
            </dl>
            {r.t && r.t.missingPrice > 0 && (
              <p className="mt-1 text-xs text-warn">有 {r.t.missingPrice} 檔沒有現價,未計入市值與損益</p>
            )}
            <div className="mt-1.5">
              <DataTime fresh={fresh(account, r.market, r.equityAt, now)} now={now} />
            </div>
          </article>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted" data-testid="twd-total">
        {sumTwd != null ? (
          <>
            換算台幣合計 <span className="num font-semibold text-fg">{fmtMoney(sumTwd, "TWD")}</span> TWD
            {fx.isDemo && "(DEMO 匯率)"}
          </>
        ) : (
          <>不換算合計:{missingFx.length ? `缺少 ${missingFx.join("、")}→TWD 匯率` : "資料不足"}(不使用猜測的匯率)</>
        )}
      </p>
    </Section>
  );
}

function PositionsGroup({ market, account, items, now }: { market: Market; account: Account; items: Position[]; now: Date }) {
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-bold text-muted">{MARKET_LABEL[market]}</h3>

      {/* 手機:卡片 */}
      <ul className="flex flex-col gap-2 md:hidden">
        {items.map((p) => {
          const c = calcPosition(p);
          return (
            <li key={p.symbol} className="rounded-[10px] border border-border bg-card px-4 py-3" data-symbol={p.symbol}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">
                  {p.symbol} <span className="text-sm font-normal text-muted">{p.name}</span>
                </span>
                <span className={`num ${signClass(c.unrealized)}`}>{fmtPct(c.unrealizedPct)}</span>
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-muted">數量</dt>
                <dd className="num text-right">{fmtQty(p.qty)}</dd>
                <dt className="text-muted">成本</dt>
                <dd className="num text-right">{fmtPrice(p.avgCost, p.currency)}</dd>
                <dt className="text-muted">現價</dt>
                <dd className="num text-right">{p.lastPrice == null ? "無資料" : fmtPrice(p.lastPrice, p.currency)}</dd>
                <dt className="text-muted">未實現損益</dt>
                <dd className={`num text-right ${signClass(c.unrealized)}`}>{fmtSigned(c.unrealized, p.currency)}</dd>
              </dl>
              <div className="mt-1">
                <DataTime fresh={fresh(account, market, p.priceAsOf, now)} now={now} prefix="報價時間" />
              </div>
            </li>
          );
        })}
      </ul>

      {/* 電腦:表格 */}
      <div className="hidden overflow-x-auto rounded-[10px] border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">代號</th>
              <th className="px-3 py-2 text-right font-medium">數量</th>
              <th className="px-3 py-2 text-right font-medium">成本</th>
              <th className="px-3 py-2 text-right font-medium">現價</th>
              <th className="px-3 py-2 text-right font-medium">未實現損益</th>
              <th className="px-3 py-2 font-medium">報價時間</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const c = calcPosition(p);
              return (
                <tr key={p.symbol} className="border-b border-border last:border-0" data-symbol={p.symbol}>
                  <td className="px-3 py-2">
                    <span className="font-bold">{p.symbol}</span> <span className="text-muted">{p.name}</span>
                    <div className="text-xs text-muted">
                      {p.currency} · {p.bot}
                    </div>
                  </td>
                  <td className="num px-3 py-2 text-right">{fmtQty(p.qty)}</td>
                  <td className="num px-3 py-2 text-right">{fmtPrice(p.avgCost, p.currency)}</td>
                  <td className="num px-3 py-2 text-right">{p.lastPrice == null ? "無資料" : fmtPrice(p.lastPrice, p.currency)}</td>
                  <td className={`num px-3 py-2 text-right ${signClass(c.unrealized)}`}>
                    {fmtSigned(c.unrealized, p.currency)}
                    {c.unrealizedPct != null && <div className="text-xs">{fmtPct(c.unrealizedPct)}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <DataTime fresh={fresh(account, market, p.priceAsOf, now)} now={now} prefix="" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
