import { createHash, timingSafeEqual } from "node:crypto";

/** 只接受 Authorization: Bearer <token>。其他格式(含 query string)一律當沒有 token。 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return null;
  // 正常 token 是幾十個字。過長的直接拒絕,避免拿超大 header 拖慢比對。
  if (match[1].length > 512) return null;
  return match[1];
}

/**
 * 常數時間比較。先雜湊成固定長度再比,長度不同也不會提早返回。
 * 呼叫端要先確認 expected 有值;空字串不在這裡處理。
 */
export function tokenEquals(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
