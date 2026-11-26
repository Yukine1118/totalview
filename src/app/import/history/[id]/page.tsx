import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { getImport, isDbConfigured } from "@/lib/db";
import { formatTaipei } from "@/lib/freshness";
import { KIND_LABEL, type ImportItem } from "@/lib/import/schema";
import { importSourceClass, importSourceLabel } from "@/lib/import/sourceLabel";
import { RestoreForm } from "./RestoreForm";

export const dynamic = "force-dynamic";

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  const { id } = await params;
  if (!isDbConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const imp = await getImport(id);
  if (!imp) notFound();

  const bots = [...new Set(imp.itemsFull.map((i) => i.bot))];

  return (
    <AppShell login={session.user.login} active="/import">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-[1.6rem] font-bold">版本 {formatTaipei(new Date(imp.created_at))}</h1>
          <span className={`rounded-full border px-1.5 text-xs leading-5 ${importSourceClass(imp.source)}`} data-source={imp.source}>
            {importSourceLabel(imp.source)}
          </span>
        </div>
        <Link href="/import/history" className="text-sm text-muted underline">
          回歷史版本
        </Link>
      </div>
      {imp.note && <p className="text-sm text-muted">{imp.note}</p>}

      <section className="rounded-[10px] border border-border bg-card px-4 py-3.5">
        <h2 className="mb-2 font-bold">內容({imp.itemsFull.length} 筆)</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {imp.itemsFull.map((it, k) => (
            <li key={k} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{it.bot}</span>
              <span>
                {KIND_LABEL[it.kind as ImportItem["kind"]] ?? it.kind}
                {it.key && <span className="text-muted"> · {it.key}</span>}
              </span>
              <span className="num text-xs text-muted">資料時間 {formatTaipei(new Date(it.as_of))}</span>
              {(it as { reverted_at?: string | null }).reverted_at && (
                <span className="rounded-full border border-warn px-1.5 text-[0.72rem] leading-5 text-warn">已被還原掉</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <RestoreForm importId={imp.id} bots={bots} />

      <details className="rounded-[10px] border border-border bg-card px-4 py-3">
        <summary className="cursor-pointer font-bold">原始內容</summary>
        <pre className="num mt-2 max-h-[480px] overflow-auto whitespace-pre-wrap break-all text-xs text-muted">{imp.raw_text}</pre>
      </details>
    </AppShell>
  );
}
