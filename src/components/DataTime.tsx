import { formatAgo, formatTaipei, type FreshResult } from "@/lib/freshness";

const STYLE = {
  fresh: { dot: "bg-ok", text: "text-muted", label: null },
  warn: { dot: "bg-warn", text: "text-warn", label: "即將過期" },
  stale: { dot: "bg-stale", text: "text-stale font-medium", label: "資料過期" },
  none: { dot: "bg-none", text: "text-muted", label: null },
} as const;

/** 每個數字旁的「資料時間」:顏色點 + 台北時間 + 多久以前 + 過期警示 */
export function DataTime({ fresh, now, prefix = "資料時間" }: { fresh: FreshResult; now: Date; prefix?: string }) {
  const s = STYLE[fresh.state];
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 text-xs ${s.text}`} data-fresh={fresh.state}>
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
      {fresh.asOf ? (
        <>
          <span>
            {prefix} <span className="num">{formatTaipei(fresh.asOf)}</span>
          </span>
          <span>· {formatAgo(fresh.asOf, now)}</span>
          {s.label && <span className="rounded-full border border-current px-1.5 leading-4">{s.label}</span>}
        </>
      ) : (
        <span>無資料</span>
      )}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded-full border border-warn px-2 text-[0.72rem] font-bold leading-5 text-warn" title="範例資料,不是真實數字">
      DEMO
    </span>
  );
}

/** v1 風格的區塊:標題在上,內容在下 */
export function Section({
  title,
  isDemo,
  right,
  children,
}: {
  title: string;
  isDemo?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[1.05rem] font-bold">{title}</h2>
          {isDemo && <DemoBadge />}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
