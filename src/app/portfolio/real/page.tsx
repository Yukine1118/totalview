import { redirect } from "next/navigation";
import { getAllowedSession } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { getPortfolio } from "@/lib/data/portfolio";

export const dynamic = "force-dynamic";

export default async function RealPortfolioPage() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const now = new Date();
  const portfolio = await getPortfolio("real", now);
  const isDemo = portfolio.positions.isDemo || portfolio.equity.isDemo;

  return (
    <AppShell login={session.user.login} active="/portfolio/real">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[1.6rem] font-bold">真實部位</h1>
        <span className="rounded-full border border-ok px-2 text-[0.72rem] font-bold leading-5 text-ok">REAL 真實資金</span>
      </div>
      {isDemo && (
        <p role="note" className="rounded-[10px] border border-warn/60 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          目前顯示的是 <b>DEMO</b> 範例資料(虛構數字),不是你的真實持股。匯入真實資料後會自動換掉。
        </p>
      )}
      <PortfolioView portfolio={portfolio} now={now} />
    </AppShell>
  );
}
