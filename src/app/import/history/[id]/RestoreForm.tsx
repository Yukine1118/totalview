"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { restoreVersion, type RestoreResult } from "../../actions";

export function RestoreForm({ importId, bots }: { importId: string; bots: string[] }) {
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[10px] border border-warn/60 bg-warn/5 px-4 py-3.5">
      <h2 className="font-bold">還原成這個版本</h2>
      <p className="mt-1 text-sm text-muted">
        會影響的 bot:<b className="text-fg">{bots.join("、")}</b>。這些 bot 在這個版本之後匯入的資料會被標記為「已還原」(不會刪除),
        並以這個版本的內容建立一個新版本。其他 bot 不受影響。
      </p>
      {result?.ok ? (
        <p role="status" className="mt-2 text-sm text-ok">
          已還原。<Link href="/" className="underline">回總覽</Link> · <Link href="/import/history" className="underline">看歷史版本</Link>
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            我確認要還原
          </label>
          <button
            type="button"
            disabled={!confirmed || pending}
            onClick={() => start(async () => setResult(await restoreVersion(importId, confirmed)))}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {pending ? "還原中…" : "還原"}
          </button>
        </div>
      )}
      {result && !result.ok && <p role="alert" className="mt-2 text-sm text-stop">{result.error}</p>}
    </section>
  );
}
