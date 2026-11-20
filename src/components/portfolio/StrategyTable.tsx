import { FRESHNESS } from "@/config/freshness";
import { evaluateFreshness } from "@/lib/freshness";
import { fmtPct, signClass } from "@/lib/portfolio";
import type { Strategy } from "@/lib/types";
import { DataTime } from "@/components/DataTime";
import { Sparkline } from "@/components/charts";

function Oos({ s }: { s: Strategy }) {
  if (s.oosReturnPct == null) {
    return <span className="rounded-full border border-warn px-2 text-[0.72rem] leading-5 text-warn">未驗證</span>;
  }
  return (
    <span className={`num ${signClass(s.oosReturnPct)}`} title={s.oosPeriod}>
      {fmtPct(s.oosReturnPct)}
    </span>
  );
}

/** 策略績效表(沿用 v1):報酬、最大回撤、交易數、樣本外、迷你曲線。手機改卡片。 */
export function StrategyTable({ items, now }: { items: Strategy[]; now: Date }) {
  if (items.length === 0) {
    return <p className="rounded-[10px] border border-border bg-card px-4 py-3.5 text-sm text-muted">無資料</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {items.map((s) => (
          <li key={`${s.bot}-${s.name}`} className="rounded-[10px] border border-border bg-card px-4 py-3" data-strategy={s.name}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold">{s.name}</div>
                <div className="text-sm text-muted">{s.market}</div>
              </div>
              <Sparkline values={s.curve} label={`${s.name} 資金曲線`} />
            </div>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted">報酬</dt>
              <dd className={`num text-right ${signClass(s.returnPct)}`}>{fmtPct(s.returnPct)}</dd>
              <dt className="text-muted">最大回撤</dt>
              <dd className="num text-right text-stop">{fmtPct(s.maxDrawdownPct, false)}</dd>
              <dt className="text-muted">交易數</dt>
              <dd className="num text-right">{s.trades ?? "—"}</dd>
              <dt className="text-muted">樣本外</dt>
              <dd className="text-right">
                <Oos s={s} />
              </dd>
            </dl>
            <div className="mt-1">
              <DataTime fresh={evaluateFreshness(s.asOf, FRESHNESS.strategies, now)} now={now} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-[10px] border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">策略</th>
              <th className="px-3 py-2 font-medium">市場</th>
              <th className="px-3 py-2 text-right font-medium">報酬</th>
              <th className="px-3 py-2 text-right font-medium">最大回撤</th>
              <th className="px-3 py-2 text-right font-medium">交易數</th>
              <th className="px-3 py-2 text-right font-medium">樣本外</th>
              <th className="px-3 py-2 font-medium">資金曲線</th>
              <th className="px-3 py-2 font-medium">資料時間</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={`${s.bot}-${s.name}`} className="border-b border-border last:border-0" data-strategy={s.name}>
                <td className="px-3 py-2 font-bold">{s.name}</td>
                <td className="px-3 py-2">{s.market}</td>
                <td className={`num px-3 py-2 text-right ${signClass(s.returnPct)}`}>{fmtPct(s.returnPct)}</td>
                <td className="num px-3 py-2 text-right text-stop">{fmtPct(s.maxDrawdownPct, false)}</td>
                <td className="num px-3 py-2 text-right">{s.trades ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Oos s={s} />
                </td>
                <td className="px-3 py-2">
                  <Sparkline values={s.curve} label={`${s.name} 資金曲線`} />
                </td>
                <td className="px-3 py-2">
                  <DataTime fresh={evaluateFreshness(s.asOf, FRESHNESS.strategies, now)} now={now} prefix="" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
