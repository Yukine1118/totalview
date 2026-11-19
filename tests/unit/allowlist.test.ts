import { describe, expect, it } from "vitest";
import { isAllowedGithubUser } from "@/lib/allowlist";

describe("isAllowedGithubUser", () => {
  const env = { ALLOWED_GITHUB_LOGIN: "Yukine1118", ALLOWED_GITHUB_ID: "12345" };

  it("允許正確的帳號 + id", () => {
    expect(isAllowedGithubUser({ login: "Yukine1118", id: 12345 }, env)).toBe(true);
  });

  it("帳號名稱不分大小寫", () => {
    expect(isAllowedGithubUser({ login: "yukine1118", id: "12345" }, env)).toBe(true);
  });

  it("拒絕其他帳號", () => {
    expect(isAllowedGithubUser({ login: "someone-else", id: 12345 }, env)).toBe(false);
  });

  it("帳號名稱對但 id 不對(例如有人搶註了改名後的帳號)→ 拒絕", () => {
    expect(isAllowedGithubUser({ login: "Yukine1118", id: 99999 }, env)).toBe(false);
  });

  it("有設定 id 但 profile 沒有 id → 拒絕", () => {
    expect(isAllowedGithubUser({ login: "Yukine1118" }, env)).toBe(false);
  });

  it("沒有 profile → 拒絕", () => {
    expect(isAllowedGithubUser(null, env)).toBe(false);
    expect(isAllowedGithubUser(undefined, env)).toBe(false);
  });

  it("login 不是字串 → 拒絕", () => {
    expect(isAllowedGithubUser({ login: 123, id: 12345 }, env)).toBe(false);
  });

  it("未設定環境變數時預設只允許 Yukine1118", () => {
    expect(isAllowedGithubUser({ login: "Yukine1118", id: 1 }, {})).toBe(true);
    expect(isAllowedGithubUser({ login: "other", id: 1 }, {})).toBe(false);
  });
});
