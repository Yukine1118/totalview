import "server-only";
import { unstable_cache } from "next/cache";
import { fetchGithubProgress, GithubError } from "@/lib/github";
import { demoOverview } from "@/lib/demo/overview";
import type { GithubProgress, Section } from "@/lib/types";

const owner = () => process.env.GITHUB_OWNER || process.env.ALLOWED_GITHUB_LOGIN || "Yukine1118";

/** 10 分鐘內重複打開頁面,直接用快取(不會一直呼叫 GitHub) */
// 快取 key 包含「有沒有 token」:加上 token 後立刻改用新結果,不會沿用只含公開 repo 的舊快取
const cached = unstable_cache(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 第二個參數只用來區分快取
  async (who: string, _withToken: boolean) => fetchGithubProgress(who, process.env.GITHUB_READ_TOKEN || undefined),
  ["github-progress-v1"],
  { revalidate: 600 },
);

/**
 * 工作進度資料來源。
 * - 正式環境(Vercel)或有設定 GITHUB_READ_TOKEN:讀 GitHub。
 * - 其他(本機、E2E 測試):DEMO。
 * 讀取失敗時回傳空資料 + 錯誤原因,不補資料。
 */
export async function getGithubSection(now: Date = new Date()): Promise<Section<GithubProgress>> {
  if (!process.env.GITHUB_READ_TOKEN && !process.env.VERCEL) return demoOverview(now).github;
  try {
    return { isDemo: false, data: await cached(owner(), Boolean(process.env.GITHUB_READ_TOKEN)) };
  } catch (e) {
    const msg = e instanceof GithubError ? e.message : "無法連線到 GitHub";
    console.error("[github]", e);
    return { isDemo: false, data: { asOf: null, commits: [], openIssues: [], openPrs: [] }, error: msg };
  }
}
