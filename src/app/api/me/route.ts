import { NextResponse } from "next/server";
import { getAllowedSession } from "@/auth";

/** 簡單的受保護 API:回傳目前登入者。用來測試「未登入一律 401」。 */
export async function GET() {
  const session = await getAllowedSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ login: session.user.login });
}
