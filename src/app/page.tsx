import { redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { DataTime, Section } from "@/components/DataTime";
import { BotFlow } from "@/components/overview/BotFlow";
import { GithubProgressCard } from "@/components/overview/GithubProgressCard";
import { UsageCards } from "@/components/overview/UsageCards";
import { FRESHNESS } from "@/config/freshness";
import { getOverview } from "@/lib/data/overview";
import { evaluateFreshness } from "@/lib/freshness";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const now = new Date();
  const { aiUsage, bots, github } = await getOverview(now);
  const anyDemo = aiUsage.isDemo || bots.isDemo || github.isDemo;

  return (
    <AppShell login={session.user.login}>
      {anyDemo && (
        <p role="note" className="rounded-[10px] border border-warn/60 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          標示 <b>DEMO</b> 的區塊是虛構的範例資料,只用來看版面。匯入真實資料後會自動換掉。
        </p>
      )}

      <Section title="AI 額度" isDemo={aiUsage.isDemo}>
        <UsageCards items={aiUsage.data} now={now} />
      </Section>

      <Section title="bot 閉環" isDemo={bots.isDemo}>
        <BotFlow bots={bots.data} now={now} />
      </Section>

      <Section
        title="工作進度"
        isDemo={github.isDemo}
        right={<DataTime fresh={evaluateFreshness(github.data.asOf, FRESHNESS.github, now)} now={now} />}
      >
        <GithubProgressCard data={github.data} now={now} />
      </Section>
    </AppShell>
  );
}
