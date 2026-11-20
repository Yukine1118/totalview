"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { commitImport, previewImport, type CommitResult, type PreviewResult } from "./actions";

const CHANGE = {
  new: { label: "新增", cls: "border-ok text-ok" },
  update: { label: "更新", cls: "border-accent text-accent" },
  older: { label: "比目前資料舊", cls: "border-warn text-warn" },
  history: { label: "加入歷史", cls: "border-border text-muted" },
} as const;

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ImportForm({ dbReady }: { dbReady: boolean }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewedText, setPreviewedText] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  const stale = preview !== null && previewedText !== text;
  const issueCount = (preview?.globalIssues.length ?? 0) + (preview?.blocks.reduce((n, b) => n + b.issues.length, 0) ?? 0);

  function check() {
    setResult(null);
    start(async () => {
      const r = await previewImport(text);
      setPreview(r);
      setPreviewedText(text);
    });
  }

  function commit() {
    start(async () => {
      const r = await commitImport(previewedText);
      setResult(r);
      if (r.ok) {
        setPreview(null);
        setText("");
      }
    });
  }

  /** 點錯誤 → 文字框選取那一行 */
  function jumpTo(line: number) {
    const el = area.current;
    if (!el) return;
    const lines = el.value.split("\n");
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    const end = start + (lines[line - 1]?.length ?? 0);
    el.focus();
    el.setSelectionRange(start, end);
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18;
    el.scrollTop = Math.max(0, (line - 4) * lineHeight);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">
          把 bot 回報裡 <code className="num">===AIWR-BEGIN===</code> 到 <code className="num">===AIWR-END===</code>{" "}
          的內容貼在這裡。可以一次貼多個 bot,也可以把 Grok 整段回覆直接貼上。
        </span>
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          wrap="off"
          aria-label="JSON 資料"
          className="num min-h-[260px] w-full overflow-auto whitespace-pre rounded-md border border-border bg-bg px-2.5 py-2 text-[0.8rem] leading-[1.5]"
          placeholder={"===AIWR-BEGIN===\n{ \"schema\": \"aiwr/v1\", \"bot\": \"...\", ... }\n===AIWR-END==="}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={check}
          disabled={pending || !text.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {pending && !preview ? "檢查中…" : "檢查格式並預覽"}
        </button>
        <Link href="/import/history" className="text-sm text-muted underline">
          歷史版本與還原
        </Link>
        <a href="https://github.com/Yukine1118/totalview/blob/HEAD/docs/grok-output-format.md" target="_blank" rel="noreferrer" className="text-sm text-muted underline">
          格式說明
        </a>
      </div>

      {result?.ok && (
        <p role="status" className="rounded-[10px] border border-ok/60 bg-ok/10 px-4 py-3 text-sm text-ok">
          已匯入 {result.count} 筆資料。<Link href="/" className="underline">回總覽</Link> ·{" "}
          <Link href="/import/history" className="underline">看歷史版本</Link>
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded-[10px] border border-stop/60 bg-stop/10 px-4 py-3 text-sm text-stop">
          {result.error}
        </p>
      )}

      {preview && (
        <section className="flex flex-col gap-3" aria-label="預覽">
          {stale && (
            <p className="rounded-md border border-warn/60 bg-warn/10 px-3 py-2 text-sm text-warn">內容已修改,請重新按「檢查格式並預覽」。</p>
          )}

          {issueCount > 0 ? (
            <div role="alert" className="rounded-[10px] border border-stop/60 bg-stop/5 px-4 py-3" data-testid="import-errors">
              <h2 className="mb-1.5 font-bold text-stop">有 {issueCount} 個問題,修正後才能匯入</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {preview.globalIssues.map((m) => (
                  <li key={m}>• {m}</li>
                ))}
                {preview.blocks.flatMap((b) =>
                  b.issues.map((i, k) => (
                    <li key={`${b.index}-${k}`}>
                      <button type="button" onClick={() => jumpTo(i.line)} className="text-left hover:underline">
                        <span className="num font-bold text-stop">第 {i.line} 行</span>
                        <span className="text-muted">(第 {b.index} 段{b.bot ? `・${b.bot}` : ""})</span>{" "}
                        {i.path && <code className="num text-xs">{i.path}</code>} {i.message}
                      </button>
                    </li>
                  )),
                )}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ok">格式檢查通過,共 {preview.blocks.length} 個 bot。請確認下面的內容再匯入。</p>
          )}

          {preview.blocks
            .filter((b) => b.rows.length > 0)
            .map((b) => (
              <article key={b.index} className="rounded-[10px] border border-border bg-card px-4 py-3" data-preview-bot={b.bot}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{b.bot}</span>
                  <span className="text-xs text-muted">第 {b.index} 段・從第 {b.startLine} 行開始</span>
                </div>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                  {b.rows.map((r) => (
                    <li key={`${r.kind}-${r.key}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`rounded-full border px-1.5 text-[0.72rem] leading-5 ${CHANGE[r.change].cls}`}>{CHANGE[r.change].label}</span>
                      <span>
                        {r.kindLabel}
                        {r.key && <span className="text-muted"> · {r.key}</span>}
                        {r.count != null && <span className="text-muted"> · {r.count} 筆</span>}
                      </span>
                      <span className="num text-xs text-muted">資料時間 {fmt(r.asOf)}</span>
                      {r.currentAsOf && <span className="num text-xs text-muted">(目前 {fmt(r.currentAsOf)})</span>}
                    </li>
                  ))}
                </ul>
              </article>
            ))}

          {issueCount === 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={commit}
                disabled={pending || stale || !dbReady}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
              >
                {pending ? "匯入中…" : "確認匯入"}
              </button>
              {!dbReady && <span className="text-sm text-warn">資料庫尚未設定,目前只能檢查格式。</span>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
