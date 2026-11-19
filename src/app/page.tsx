import { redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell, Card } from "@/components/AppShell";

export const dynamic = "force-dynamic";

// 第 1 階段的佔位頁:只確認登入後看得到。第 2 階段會換成 AI 用量 / bot 狀態 / 工作進度。
export default async function Home() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  return (
    <AppShell login={session.user.login}>
      <Card title="登入成功">
        <p className="text-sm text-muted">
          你好,{session.user.login}。目前是第 1 階段骨架,儀表板內容會在第 2 階段加入。
        </p>
      </Card>
    </AppShell>
  );
}
