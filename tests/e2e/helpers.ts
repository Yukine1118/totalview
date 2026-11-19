import { encode } from "next-auth/jwt";
import type { BrowserContext } from "@playwright/test";
import { TEST_ENV } from "../../playwright.config";

const COOKIE = "authjs.session-token";

/** 用測試密鑰做出一個 session cookie(模擬已登入),只在測試裡使用。 */
export async function loginAs(context: BrowserContext, login: string, githubId: string) {
  const value = await encode({
    secret: TEST_ENV.AUTH_SECRET,
    salt: COOKIE,
    token: { name: login, login, githubId, sub: githubId },
  });
  await context.addCookies([
    { name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
}
