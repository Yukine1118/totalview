import { UploadError, type Watermark } from "./types";

export function emptyWatermark(): Watermark {
  return { version: 1, sent: {} };
}

export function loadWatermark(text: string | null): Watermark {
  if (text === null || text.trim() === "") return emptyWatermark();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new UploadError("水位檔不是合法 JSON。沒有自動清空,避免把已經送過的交易再送一次。");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new UploadError("水位檔格式不對");
  const sent = (raw as { sent?: unknown }).sent;
  if (sent === undefined) return emptyWatermark();
  if (!sent || typeof sent !== "object" || Array.isArray(sent)) throw new UploadError("水位檔的 sent 格式不對");
  const out: Record<string, string[]> = {};
  for (const [bot, hashes] of Object.entries(sent)) {
    if (!Array.isArray(hashes) || hashes.some((h) => typeof h !== "string")) {
      throw new UploadError(`水位檔裡 ${bot} 的紀錄格式不對`);
    }
    out[bot] = hashes;
  }
  return { version: 1, sent: out };
}

export function remember(wm: Watermark, extra: Record<string, string[]>): Watermark {
  const sent: Record<string, string[]> = { ...wm.sent };
  for (const [bot, hashes] of Object.entries(extra)) {
    sent[bot] = [...new Set([...(sent[bot] ?? []), ...hashes])].sort();
  }
  return { version: 1, sent };
}

export function watermarkJson(wm: Watermark): string {
  const sent: Record<string, string[]> = {};
  for (const bot of Object.keys(wm.sent).sort()) sent[bot] = [...wm.sent[bot]].sort();
  return JSON.stringify({ version: 1, sent }, null, 2) + "\n";
}
