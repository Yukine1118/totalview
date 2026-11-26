/**
 * 不需要 GitHub 登入的路徑。純函式,給 middleware 與單元測試共用。
 *
 * /api/ingest 是唯一的額外例外,而且必須路徑完全相等:
 * 它不靠登入,改由環境變數 INGEST_TOKEN 把關(見 src/lib/ingest/handle.ts)。
 * /api/ingest/其他、/api/ingests 一律仍要登入。
 */
export function isLoginExempt(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/api/ingest";
}
