import { redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { isDbConfigured } from "@/lib/db";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  return (
    <AppShell login={session.user.login} active="/import">
      <h1 className="text-[1.6rem] font-bold">匯入資料</h1>
      <p className="text-sm text-muted">
        流程:貼上 → 檢查格式並預覽 → 確認匯入。每次匯入都會保存成一個版本,之後可以在「歷史版本」還原。
      </p>
      <ImportForm dbReady={isDbConfigured()} />
    </AppShell>
  );
}
