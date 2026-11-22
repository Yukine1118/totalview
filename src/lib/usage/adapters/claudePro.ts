import { manualAdapter } from "./manual";

/**
 * Claude Pro:Anthropic 沒有提供查詢「訂閱額度」的 API(2026-11 查證)。
 * 只能在 claude.ai 的 Settings → Usage,或 Claude Code 裡輸入 /usage 查看 → 手動。
 */
export const claudePro = manualAdapter("Claude Pro", "claude.ai → Settings → Usage(或 Claude Code 輸入 /usage)", "https://claude.ai/settings/usage");
