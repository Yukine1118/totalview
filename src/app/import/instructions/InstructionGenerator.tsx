"use client";

import { useMemo, useState } from "react";
import { BLOCKS, buildInstruction, validateBotName, type BlockId } from "@/lib/import/instructions";

export function InstructionGenerator() {
  const [bot, setBot] = useState("");
  const [blocks, setBlocks] = useState<BlockId[]>(["bot_status", "summary"]);
  const [market, setMarket] = useState<"TW" | "CRYPTO">("TW");
  const [copied, setCopied] = useState(false);

  const nameError = validateBotName(bot);
  const text = useMemo(
    () => (nameError || blocks.length === 0 ? "" : buildInstruction({ bot, blocks, market })),
    [bot, blocks, market, nameError],
  );

  function toggle(id: BlockId) {
    setCopied(false);
    setBlocks((cur) => (cur.includes(id) ? cur.filter((b) => b !== id) : [...cur, id]));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      alert("無法自動複製,請在下方文字框長按全選後複製。");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">1. bot 名稱</span>
        <input
          value={bot}
          onChange={(e) => {
            setBot(e.target.value);
            setCopied(false);
          }}
          placeholder="例如:台股模擬交易室"
          className="rounded-md border border-border bg-bg px-2.5 py-2"
          aria-label="bot 名稱"
        />
        <span className="text-xs text-muted">網站靠這個名稱辨識 bot,之後不要改。{bot && nameError ? <b className="text-stop"> {nameError}</b> : null}</span>
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-bold">2. 這個 bot 會回報哪些資料?</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {BLOCKS.map((b) => (
            <label key={b.id} className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <input type="checkbox" checked={blocks.includes(b.id)} onChange={() => toggle(b.id)} className="mt-1" />
              <span>
                {b.label} <span className="text-xs text-muted">· {b.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="mb-1.5 text-sm font-bold">3. 範例用哪個市場?</legend>
        {(["TW", "CRYPTO"] as const).map((m) => (
          <label key={m} className="flex items-center gap-1.5">
            <input type="radio" name="market" checked={market === m} onChange={() => setMarket(m)} />
            {m === "TW" ? "台股(TWD)" : "加密貨幣(USDT)"}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold">4. 複製後貼到 Grok bot 指令的最後面</span>
          <button
            type="button"
            onClick={copy}
            disabled={!text}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {copied ? "已複製 ✓" : "複製指令"}
          </button>
        </div>
        <textarea
          readOnly
          value={text || (blocks.length === 0 ? "請至少勾選一種資料" : "請先輸入 bot 名稱")}
          aria-label="產生的指令"
          className="num min-h-[320px] w-full rounded-md border border-border bg-bg px-2.5 py-2 text-[0.8rem] leading-[1.5]"
        />
      </div>
    </div>
  );
}
