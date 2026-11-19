import Link from "next/link";
import { signOut } from "@/auth";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "總覽" },
  { href: "/portfolio/real", label: "真實部位" },
  { href: "/portfolio/paper", label: "模擬部位" },
  { href: "/import", label: "匯入" },
];

/** 共用外框:頂部導覽 + 單欄內容(沿用 v1:最寬 980px) */
export function AppShell({ login, children }: { login?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[980px] px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-lg font-bold">
            AI 作戰室
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg">
                登出{login ? ` ${login}` : ""}
              </button>
            </form>
          </div>
        </div>
        <nav className="mt-2 flex gap-4 overflow-x-auto text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-muted hover:text-fg">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex flex-col gap-[22px]">{children}</main>
    </div>
  );
}

export function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-border bg-card px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[1.05rem] font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
