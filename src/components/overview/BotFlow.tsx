import { botStatusRule } from "@/config/freshness";
import { evaluateFreshness, formatTaipei } from "@/lib/freshness";
import type { BotStatus } from "@/lib/types";
import { DataTime } from "@/components/DataTime";

const LABEL = { ok: "正常", warn: "注意", stop: "停擺" } as const;
const BORDER = { ok: "border-l-ok", warn: "border-l-warn", stop: "border-l-stop" } as const;
const TEXT = { ok: "text-ok", warn: "text-warn", stop: "text-stop" } as const;

/** bot 閉環(沿用 v1):每個 bot 一個節點,左邊色條代表狀態。手機直排、電腦橫排。 */
export function BotFlow({ bots, now }: { bots: BotStatus[]; now: Date }) {
  if (bots.length === 0) {
    return <p className="rounded-[10px] border border-border bg-card px-4 py-3.5 text-sm text-muted">無資料</p>;
  }
  return (
    <>
      <ol className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-stretch">
        {bots.map((b, i) => {
          const fresh = evaluateFreshness(b.asOf, botStatusRule(b.bot), now);
          return (
            <li key={b.bot} className="flex flex-col gap-2 md:flex-1 md:basis-[260px] md:flex-row">
              <div
                className={`flex-1 rounded-[10px] border border-l-[5px] border-border bg-card px-3 py-2.5 ${BORDER[b.status]}`}
                data-bot={b.bot}
                data-status={b.status}
              >
                <div className={`text-xs font-bold ${TEXT[b.status]}`}>{LABEL[b.status]}</div>
                <div className="font-bold">{b.bot}</div>
                {/* 最後執行時間通常就是資料時間;不同時才另外列出,避免重複 */}
                {b.lastRunAt && b.lastRunAt !== b.asOf && (
                  <div className="text-sm text-muted">
                    最後執行 <span className="num">{formatTaipei(new Date(b.lastRunAt))}</span>
                  </div>
                )}
                {b.note && <div className="text-sm text-muted">{b.note}</div>}
                <div className="mt-1">
                  <DataTime fresh={fresh} now={now} prefix={b.lastRunAt === b.asOf ? "最後執行" : "資料時間"} />
                </div>
              </div>
              {i < bots.length - 1 && (
                <span className="self-center text-xl text-muted" aria-hidden="true">
                  <span className="md:hidden">↓</span>
                  <span className="hidden md:inline">→</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
        <b className="text-warn">建議加一道關卡:</b>
        策略回測通過後,先用沒參與優化的期間(樣本外)再驗證一次,才送回模擬交易。這樣可以降低回測漂亮、實盤變差的風險。
      </p>
    </>
  );
}
