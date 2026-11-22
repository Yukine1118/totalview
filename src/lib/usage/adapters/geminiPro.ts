import { manualAdapter } from "./manual";

/** Gemini Pro(Google AI Pro 訂閱):沒有公開 API 查詢訂閱額度(2026-11 查證)→ 手動。 */
export const geminiPro = manualAdapter("Gemini Pro", "Gemini App 內的用量 / 方案頁面");
