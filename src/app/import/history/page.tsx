import Link from "next/link";
import { redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { isDbConfigured, listImports } from "@/lib/db";
import { formatTaipei } from "@/lib/freshness";
import { KIND_LABEL, type ImportItem } from "@/lib/import/schema";
import { importSourceClass, importSourceLabel } from "@/lib/import/sourceLabel";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  const dbReady = isDbConfigured();
  const imports = dbReady ? await listImports(100) : [];

  return (
    <AppShell login={session.user.login} active="/import">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[1.6rem] font-bold">歷史版本</h1>
        <Link href="/import" className="text-sm text-muted underline">
          回匯入
        </Link>
      </div>
      <p className="text-sm text-muted">每次匯入或還原都是一個版本。版本不會被刪除;還原時,較新的資料只會被標記為「已還原」。</p>

      {!dbReady && <p className="text-sm text-warn">資料庫尚未設定。</p>}
      {dbReady && imports.length === 0 && (
        <p className="rounded-[10px] border border-border bg-card px-4 py-3.5 text-sm text-muted">無資料(還沒有匯入過)</p>
      )}

      <ol className="flex flex-col gap-2">
        {imports.map((imp) => {
          const bots = [...new Set(imp.items.map((i) => i.bot))];
          const kinds = [...new Set(imp.items.map((i) => KIND_LABEL[i.kind as ImportItem["kind"]] ?? i.kind))];
          const reverted = imp.items.filter((i) => i.reverted_at).length;
          return (
            <li key={imp.id}>
              <Link
                href={`/import/history/${imp.id}`}
                className="block rounded-[10px] border border-border bg-card px-4 py-3 hover:border-accent"
                data-import-id={imp.id}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="num font-bold">{formatTaipei(new Date(imp.created_at))}</span>
                  <span className="flex gap-1.5 text-xs">
                    <span className={`rounded-full border px-1.5 leading-5 ${importSourceClass(imp.source)}`} data-source={imp.source}>
                      {importSourceLabel(imp.source)}
                    </span>
                    {reverted > 0 && (
                      <span className="rounded-full border border-warn px-1.5 leading-5 text-warn">{reverted} 筆已被還原掉</span>
                    )}
                  </span>
                </div>
                <div className="mt-0.5 text-sm">{bots.join("、")}</div>
                <div className="text-xs text-muted">
                  {kinds.join("・")} · 共 {imp.items.length} 筆{imp.note ? ` · ${imp.note}` : ""}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </AppShell>
  );
}
