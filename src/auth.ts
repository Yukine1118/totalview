import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAllowedGithubUser } from "@/lib/allowlist";

/**
 * 登入設定(Auth.js v5)。
 * - 只有 GitHub 登入。
 * - signIn:非允許帳號直接拒絕,不會產生 session。
 * - jwt / session:把 GitHub login 與 id 存進加密的 session cookie,
 *   middleware 與每個伺服器端讀取都會再檢查一次(雙重保險)。
 * 需要的環境變數:AUTH_SECRET、AUTH_GITHUB_ID、AUTH_GITHUB_SECRET(見 .env.example)。
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    signIn({ profile }) {
      return isAllowedGithubUser({ login: profile?.login, id: profile?.id });
    },
    jwt({ token, profile }) {
      if (profile) {
        token.login = profile.login;
        token.githubId = profile.id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.login = typeof token.login === "string" ? token.login : undefined;
      session.user.githubId = token.githubId != null ? String(token.githubId) : undefined;
      return session;
    },
  },
});

/** 伺服器端用:回傳「通過白名單的」session,否則 null。 */
export async function getAllowedSession() {
  const session = await auth();
  if (!session?.user) return null;
  if (!isAllowedGithubUser({ login: session.user.login, id: session.user.githubId })) return null;
  return session;
}
