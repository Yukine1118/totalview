import { FRESHNESS } from "@/config/freshness";
import { evaluateFreshness, formatTaipei } from "@/lib/freshness";
import type { AiUsage } from "@/lib/types";
import { DataTime } from "@/components/DataTime";

function resetText(resetAt: string | null, now: Date): string | null {
  if (!resetAt) return null;
  const t = new Date(resetAt);
  if (Number.isNaN(t.getTime())) return null;
  const hours = (t.getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return "已過重置時間";
  if (hours < 24) return `${Math.max(1, Math.round(hours))} 小時後重置`;
  return `${Math.round(hours / 24)} 天後重置`;
}

/** AI 訂閱用量卡片(沿用 v1:大字顯示剩餘 %、進度條、重置時間) */
export function UsageCards({ items, now }: { items: AiUsage[]; now: Date }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((u) => {
        const rule = FRESHNESS.aiUsage[u.source];
        const fresh = evaluateFreshness(u.asOf, rule, now);
        const unknown = u.usedPct == null || fresh.state === "none";
        const used = unknown ? 0 : Math.max(0, Math.min(100, u.usedPct!));
        const barColor = used >= 90 ? "bg-stop" : used >= 70 ? "bg-warn" : "bg-ok";
        const reset = resetText(u.resetAt, now);
        return (
          <article key={u.service} className="rounded-[10px] border border-border bg-card px-4 py-3.5" data-service={u.service}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{u.service}</span>
              <span
                className={`rounded-full border px-2 text-[0.72rem] leading-5 ${
                  u.source === "auto" ? "border-accent text-accent" : "border-border text-muted"
                }`}
              >
                {u.source === "auto" ? "自動" : "手動"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className={`num text-[1.7rem] font-semibold ${unknown ? "text-muted" : ""}`}>
                {unknown ? "無資料" : `${100 - used}%`}
              </span>
              <span className="text-sm text-muted">{unknown ? "" : `剩餘 · 已用 ${used}%`}</span>
            </div>
            <div className="my-2 h-2.5 overflow-hidden rounded-md bg-track" role="img" aria-label={unknown ? "無資料" : `已用 ${used}%`}>
              <i className={`block h-full rounded-md ${barColor}`} style={{ width: `${used}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <DataTime fresh={fresh} now={now} />
              {reset && (
                <span className="text-xs text-muted" title={u.resetAt ? formatTaipei(new Date(u.resetAt)) : undefined}>
                  {reset}
                </span>
              )}
            </div>
            {u.note && <p className="mt-1.5 text-sm text-muted">{u.note}</p>}
          </article>
        );
      })}
    </div>
  );
}
