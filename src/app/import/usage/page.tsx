import Link from "next/link";
import { redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { fetchCurrentItems, isDbConfigured } from "@/lib/db";
import { readAllUsage, USAGE_ADAPTERS } from "@/lib/usage";
import { isoToTaipeiLocal } from "@/lib/usage/manualReport";
import { UsageForm, type UsageRow } from "./UsageForm";

export const dynamic = "force-dynamic";

export default async function ManualUsagePage() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const dbReady = isDbConfigured();
  const current = await readAllUsage(dbReady ? await fetchCurrentItems() : [], new Date());
  const initial: UsageRow[] = USAGE_ADAPTERS.map((a, i) => ({
    service: a.service,
    whereToCheck: a.whereToCheck,
    checkUrl: a.checkUrl,
    usedPct: current[i].usedPct == null ? "" : String(current[i].usedPct),
    resetLocal: isoToTaipeiLocal(current[i].resetAt),
    note: current[i].note ?? "",
    currentAsOf: current[i].asOf,
  }));

  return (
    <AppShell login={session.user.login} active="/import">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[1.6rem] font-bold">手動更新 AI 用量</h1>
        <Link href="/" className="text-sm text-muted underline">
          回總覽
        </Link>
      </div>
      <p className="text-sm text-muted">
        這四個服務目前都沒有官方 API 可以自動讀取用量,所以要手動填。到各服務的用量頁看完後填在這裡;
        儲存時會走和「匯入」一樣的檢查,並留下歷史版本。
      </p>
      <UsageForm initial={initial} dbReady={dbReady} />
    </AppShell>
  );
}
