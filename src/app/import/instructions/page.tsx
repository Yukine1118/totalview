import Link from "next/link";
import { redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { InstructionGenerator } from "./InstructionGenerator";

export const dynamic = "force-dynamic";

export default async function InstructionsPage() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  return (
    <AppShell login={session.user.login} active="/import">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[1.6rem] font-bold">產生 bot 指令</h1>
        <Link href="/import" className="text-sm text-muted underline">
          回匯入
        </Link>
      </div>
      <p className="text-sm text-muted">
        每個 bot 只需要設定一次。產生的指令已經填好 bot 名稱,範例只包含你勾選的資料,而且保證能通過匯入檢查。
      </p>
      <InstructionGenerator />
    </AppShell>
  );
}
