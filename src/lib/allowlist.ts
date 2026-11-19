/**
 * 誰可以登入:只允許單一 GitHub 帳號。
 * 這個檔案刻意寫成「純函式」,方便單元測試,不依賴 Next.js。
 *
 * 規則(全部都要成立才放行,任何一項缺資料就拒絕 = fail closed):
 * 1. GitHub 帳號名稱(login)等於 ALLOWED_GITHUB_LOGIN(預設 Yukine1118,不分大小寫)
 * 2. 若有設定 ALLOWED_GITHUB_ID(GitHub 數字 id),id 也必須相符。
 *    數字 id 不會因為改名而變,所以正式環境強烈建議設定。
 */

export const DEFAULT_ALLOWED_LOGIN = "Yukine1118";

export type AllowlistEnv = {
  ALLOWED_GITHUB_LOGIN?: string;
  ALLOWED_GITHUB_ID?: string;
};

export type GithubIdentity = {
  login?: unknown;
  id?: unknown;
};

export function isAllowedGithubUser(
  who: GithubIdentity | null | undefined,
  env: AllowlistEnv = process.env as AllowlistEnv,
): boolean {
  if (!who) return false;

  const allowedLogin = (env.ALLOWED_GITHUB_LOGIN || DEFAULT_ALLOWED_LOGIN).trim().toLowerCase();
  if (typeof who.login !== "string" || who.login.trim().toLowerCase() !== allowedLogin) {
    return false;
  }

  const allowedId = env.ALLOWED_GITHUB_ID?.trim();
  if (allowedId) {
    if (who.id === undefined || who.id === null) return false;
    if (String(who.id) !== allowedId) return false;
  }

  return true;
}
