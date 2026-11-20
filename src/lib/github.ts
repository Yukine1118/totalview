import type { GithubItem, GithubProgress } from "@/lib/types";

/**
 * GitHub 工作進度:最近 commit、開放中的 issues / PR。
 * 只用 GitHub 官方 REST API 的「讀取」功能。
 * - 有 GITHUB_READ_TOKEN(fine-grained、唯讀):可看到私人 repo,額度 5000 次/小時。
 * - 沒有 token:只看公開 repo,額度 60 次/小時(容易用完)。
 */

export const REPO_LIMIT = 5;
const COMMITS_PER_REPO = 5;
const SHOW_COMMITS = 8;

type ApiRepo = { name: string; full_name: string; pushed_at: string | null; archived: boolean; fork: boolean };
type ApiCommit = { sha: string; html_url: string; commit: { message: string; author: { date: string } | null; committer: { date: string } | null } };
type ApiIssue = { title: string; html_url: string; updated_at: string; pull_request?: unknown };

/** 純函式:把 API 回應整理成畫面要的格式(有單元測試) */
export function buildProgress(
  repos: ApiRepo[],
  commits: Record<string, ApiCommit[]>,
  issues: Record<string, ApiIssue[]>,
  asOf: string,
): GithubProgress {
  const names = new Set(repos.map((r) => r.name));
  const allCommits: GithubItem[] = Object.entries(commits)
    .filter(([repo]) => names.has(repo))
    .flatMap(([repo, list]) =>
      list.map((c) => ({
        kind: "commit" as const,
        repo,
        // 只取 commit 訊息第一行
        title: c.commit.message.split("\n")[0].slice(0, 120),
        url: c.html_url,
        at: c.commit.author?.date ?? c.commit.committer?.date ?? asOf,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, SHOW_COMMITS);

  const openIssues: GithubItem[] = [];
  const openPrs: GithubItem[] = [];
  for (const [repo, list] of Object.entries(issues)) {
    if (!names.has(repo)) continue;
    for (const i of list) {
      const item = { repo, title: i.title.slice(0, 120), url: i.html_url, at: i.updated_at };
      if (i.pull_request) openPrs.push({ kind: "pr", ...item });
      else openIssues.push({ kind: "issue", ...item });
    }
  }
  const byTime = (a: GithubItem, b: GithubItem) => b.at.localeCompare(a.at);
  return { asOf, commits: allCommits, openIssues: openIssues.sort(byTime), openPrs: openPrs.sort(byTime) };
}

/** 依最近 push 時間挑出要看的 repo(排除封存與 fork) */
export function pickRepos(repos: ApiRepo[], limit = REPO_LIMIT): ApiRepo[] {
  return repos
    .filter((r) => !r.archived && !r.fork && r.pushed_at)
    .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, limit);
}

export class GithubError extends Error {}

async function gh<T>(path: string, token: string | undefined): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-war-room",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 401) throw new GithubError("GitHub token 無效或已過期,請到 GitHub 重新產生並更新 Vercel 的 GITHUB_READ_TOKEN");
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (res.status === 429 || remaining === "0") {
      throw new GithubError(token ? "GitHub 讀取次數暫時用完,稍後會自動恢復" : "GitHub 讀取次數用完(未設定 token 時每小時只有 60 次)");
    }
    throw new GithubError("沒有權限讀取 GitHub(請檢查 GITHUB_READ_TOKEN 的權限設定)");
  }
  if (res.status === 409) return [] as T; // 空 repo 沒有 commit
  if (!res.ok) throw new GithubError(`GitHub 回應錯誤 ${res.status}`);
  return (await res.json()) as T;
}

/** 實際呼叫 GitHub(約 1 + 2×5 次請求) */
export async function fetchGithubProgress(owner: string, token: string | undefined, now = new Date()): Promise<GithubProgress> {
  // 有 token 用 /user/repos(含私人 repo);沒有就只看公開
  const all = token
    ? await gh<ApiRepo[]>("/user/repos?affiliation=owner&sort=pushed&per_page=30", token)
    : await gh<ApiRepo[]>(`/users/${encodeURIComponent(owner)}/repos?sort=pushed&per_page=30`, token);
  // 沒有 token 時每小時只有 60 次,少看幾個 repo(1 + 2×3 = 7 次 / 10 分鐘)
  const repos = pickRepos(all, token ? REPO_LIMIT : 3);

  const commits: Record<string, ApiCommit[]> = {};
  const issues: Record<string, ApiIssue[]> = {};
  await Promise.all(
    repos.map(async (r) => {
      const [c, i] = await Promise.all([
        gh<ApiCommit[]>(`/repos/${r.full_name}/commits?per_page=${COMMITS_PER_REPO}`, token),
        gh<ApiIssue[]>(`/repos/${r.full_name}/issues?state=open&per_page=20&sort=updated`, token),
      ]);
      commits[r.name] = c;
      issues[r.name] = i;
    }),
  );
  return buildProgress(repos, commits, issues, now.toISOString());
}
