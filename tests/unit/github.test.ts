import { describe, expect, it } from "vitest";
import { buildProgress, pickRepos } from "@/lib/github";

const repo = (name: string, pushed: string | null, extra = {}) => ({
  name, full_name: `me/${name}`, pushed_at: pushed, archived: false, fork: false, ...extra,
});
const commit = (msg: string, date: string) => ({
  sha: msg, html_url: `https://github.com/x/${msg}`, commit: { message: msg, author: { date }, committer: { date } },
});

describe("pickRepos", () => {
  it("依最近 push 排序,排除封存、fork、空 repo", () => {
    const picked = pickRepos([
      repo("old", "2026-01-01T00:00:00Z"),
      repo("new", "2026-11-20T00:00:00Z"),
      repo("archived", "2026-11-21T00:00:00Z", { archived: true }),
      repo("forked", "2026-11-21T00:00:00Z", { fork: true }),
      repo("empty", null),
    ]);
    expect(picked.map((r) => r.name)).toEqual(["new", "old"]);
  });
});

describe("buildProgress", () => {
  it("commit 依時間合併排序,只取第一行;issue 和 PR 分開", () => {
    const p = buildProgress(
      [repo("a", "2026-11-20T00:00:00Z"), repo("b", "2026-11-19T00:00:00Z")],
      {
        a: [commit("fix login\n\nlong body", "2026-11-20T03:00:00Z")],
        b: [commit("add page", "2026-11-20T05:00:00Z"), commit("init", "2026-11-18T00:00:00Z")],
      },
      {
        a: [
          { title: "bug", html_url: "u1", updated_at: "2026-11-19T00:00:00Z" },
          { title: "feature PR", html_url: "u2", updated_at: "2026-11-20T00:00:00Z", pull_request: {} },
        ],
      },
      "2026-11-20T06:00:00Z",
    );
    expect(p.commits.map((c) => `${c.repo}:${c.title}`)).toEqual(["b:add page", "a:fix login", "b:init"]);
    expect(p.openIssues.map((i) => i.title)).toEqual(["bug"]);
    expect(p.openPrs.map((i) => i.title)).toEqual(["feature PR"]);
    expect(p.asOf).toBe("2026-11-20T06:00:00Z");
  });

  it("沒有資料就是空陣列(不補)", () => {
    const p = buildProgress([], {}, {}, "2026-11-20T06:00:00Z");
    expect(p.commits).toEqual([]);
    expect(p.openIssues).toEqual([]);
  });
});
