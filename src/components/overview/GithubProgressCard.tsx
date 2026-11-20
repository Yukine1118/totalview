import { formatAgo } from "@/lib/freshness";
import type { GithubItem, GithubProgress } from "@/lib/types";

function ItemList({ title, items, now }: { title: string; items: GithubItem[]; now: Date }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-muted">
        {title} <span className="num">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">無資料</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={`${it.repo}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-muted">{it.repo} · </span>
                {it.url ? (
                  <a href={it.url} className="hover:underline" target="_blank" rel="noreferrer">
                    {it.title}
                  </a>
                ) : (
                  it.title
                )}
              </span>
              <span className="shrink-0 text-xs text-muted">{formatAgo(new Date(it.at), now)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 工作進度:最近 commit、開放中的 issues / PR */
export function GithubProgressCard({ data, now }: { data: GithubProgress; now: Date }) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-3.5">
      <ItemList title="最近 commit" items={data.commits} now={now} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ItemList title="開放中的 PR" items={data.openPrs} now={now} />
        <ItemList title="開放中的 issues" items={data.openIssues} now={now} />
      </div>
    </div>
  );
}
