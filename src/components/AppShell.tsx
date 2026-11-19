import Link from "next/link";
import { signOut } from "@/auth";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "總覽" },
  { href: "/portfolio/real", label: "真實部位" },
  { href: "/portfolio/paper", label: "模擬部位" },
  { href: "/import", label: "匯入" },
];

/** 共用外框:頂部導覽 + 單欄內容(手機與電腦都用同一欄,最寬 760px) */
export function AppShell({ login, children }: { login?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="font-semibold">
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
      <main className="flex flex-col gap-4">{children}</main>
    </div>
  );
}

export function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
