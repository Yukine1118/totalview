import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedGithubUser } from "@/lib/allowlist";

/**
 * 守門員:每一個請求(頁面 + API)都先經過這裡。
 * - 只放行 /login 與 /api/auth/*(登入流程本身)。
 * - 未登入或非允許帳號:API 回 401(不含任何資料),頁面導向 /login。
 */
const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth/") || PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const user = req.auth?.user;
  const ok = !!user && isAllowedGithubUser({ login: user.login, id: user.githubId });
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", req.nextUrl.origin);
  return NextResponse.redirect(url);
});

export const config = {
  // 除了 Next.js 內部靜態檔與 favicon,全部都要檢查
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
