import { manualAdapter } from "./manual";

/**
 * Google AI Studio / Gemini API:
 * 理論上可用 Google Cloud Monitoring API 讀 generativelanguage.googleapis.com 的配額用量,
 * 但需要建立 GCP 服務帳號,且有開發者回報免費方案的用量不一定會出現(2026-11 查證)。
 * 尚未驗證前維持手動;若改成自動,只要把這個檔案換成 mode "auto" 的 adapter。
 */
export const googleAiStudio = manualAdapter("Google AI Studio", "aistudio.google.com → 用量 / Rate limit 頁面", "https://aistudio.google.com");
