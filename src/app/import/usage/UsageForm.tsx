"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { AiService } from "@/lib/usage/types";
import { buildManualUsageReport } from "@/lib/usage/manualReport";
import { commitImport, previewImport } from "../actions";

export type UsageRow = {
  service: AiService;
  whereToCheck: string;
  checkUrl?: string;
  usedPct: string;
  resetLocal: string;
  note: string;
  currentAsOf: string | null;
};

export function UsageForm({ initial, dbReady }: { initial: UsageRow[]; dbReady: boolean }) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, include: false })));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<(typeof rows)[number]>) => {
    setMsg(null);
    setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...patch, include: true } : r)));
  };

  const chosen = rows.filter((r) => r.include);
  const invalid = chosen.find((r) => r.usedPct.trim() !== "" && (isNaN(Number(r.usedPct)) || Number(r.usedPct) < 0 || Number(r.usedPct) > 100));

  function save() {
    start(async () => {
      const text = buildManualUsageReport(
        chosen.map((r) => ({ service: r.service, usedPct: r.usedPct.trim() === "" ? null : Number(r.usedPct), resetLocal: r.resetLocal, note: r.note })),
        new Date(),
      );
      // 走和貼 JSON 一樣的檢查 → 寫入流程
      const p = await previewImport(text);
      if (!p.ok) {
        const first = [...p.globalIssues, ...p.blocks.flatMap((b) => b.issues.map((x) => `${x.path} ${x.message}`))][0];
        setMsg({ ok: false, text: `格式檢查沒過:${first ?? "未知錯誤"}` });
        return;
      }
      const r = await commitImport(text);
      setMsg(r.ok ? { ok: true, text: `已更新 ${chosen.length} 個服務。` } : { ok: false, text: r.error });
      if (r.ok) setRows((cur) => cur.map((x) => ({ ...x, include: false })));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <fieldset
          key={r.service}
          className={`rounded-[10px] border bg-card px-4 py-3 ${r.include ? "border-accent" : "border-border"}`}
          data-usage-row={r.service}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" checked={r.include} onChange={(e) => setRows((cur) => cur.map((x, k) => (k === i ? { ...x, include: e.target.checked } : x)))} />
              {r.service}
            </label>
            <span className="text-xs text-muted">
              去哪裡看:{r.checkUrl ? <a href={r.checkUrl} target="_blank" rel="noreferrer" className="underline">{r.whereToCheck}</a> : r.whereToCheck}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_1fr]">
            <label className="flex flex-col gap-0.5 text-xs text-muted">
              已用 %
              <input
                inputMode="decimal"
                value={r.usedPct}
                onChange={(e) => set(i, { usedPct: e.target.value })}
                placeholder="不知道就留空"
                aria-label={`${r.service} 已用百分比`}
                className="num rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-muted">
              重置時間(台北)
              <input
                type="datetime-local"
                value={r.resetLocal}
                onChange={(e) => set(i, { resetLocal: e.target.value })}
                aria-label={`${r.service} 重置時間`}
                className="num rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-muted">
              備註
              <input
                value={r.note}
                onChange={(e) => set(i, { note: e.target.value })}
                maxLength={300}
                aria-label={`${r.service} 備註`}
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
              />
            </label>
          </div>
        </fieldset>
      ))}

      {invalid && <p className="text-sm text-stop">{invalid.service} 的已用 % 要是 0–100 的數字。</p>}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-stop"}`}>
          {msg.text} {msg.ok && <Link href="/" className="underline">回總覽</Link>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || chosen.length === 0 || Boolean(invalid) || !dbReady}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "儲存中…" : `更新 ${chosen.length} 個服務`}
        </button>
        <span className="text-xs text-muted">只會更新有勾選(或有修改)的服務;資料時間記為現在。</span>
        {!dbReady && <span className="text-sm text-warn">資料庫尚未設定。</span>}
      </div>
    </div>
  );
}
