import { manualAdapter } from "./manual";

/**
 * Grok Premium / SuperGrok:xAI 官方說明只有 App 或網頁的 Settings → Usage 可以看(2026-11 查證),
 * 沒有 API;第三方擴充功能是自己估算,不可靠 → 手動。
 */
export const grokPremium = manualAdapter("Grok Premium", "grok.com 或 App → Settings → Usage", "https://grok.com");
