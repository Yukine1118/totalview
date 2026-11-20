import { describe, expect, it } from "vitest";
import GitHub from "next-auth/providers/github";

/**
 * GitHub 在登入回呼時會帶 `iss` 參數(RFC 9207)。
 * 舊版 Auth.js 沒有設定 GitHub 的 issuer,會用假值 https://authjs.dev 比對而登入失敗
 * (錯誤訊息:unexpected "iss" (issuer) response parameter value)。
 * 這個測試確保套件版本不會退回有問題的版本。
 */
describe("GitHub provider", () => {
  it("issuer 是 GitHub 的 OAuth issuer", () => {
    const provider = GitHub({ clientId: "x", clientSecret: "y" });
    expect(provider.issuer).toBe("https://github.com/login/oauth");
  });
});
