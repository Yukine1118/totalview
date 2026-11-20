import Link from "next/link";
import { signOut } from "@/auth";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "總覽" },
  { href: "/portfolio/real", label: "真實部位" },
  { href: "/portfolio/paper", label: "模擬部位" },
  { href: "/import", label: "匯入" },
];

/** 模擬頁的斜紋色帶 */
const PAPER_STRIPES = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, var(--paper) 0 12px, color-mix(in srgb, var(--paper) 80%, black) 12px 24px)",
};

/**
 * 共用外框:頂部導覽 + 單欄內容(沿用 v1:最寬 980px)。
 * variant="paper":整頁換成模擬色調、加紫色外框與斜紋「模擬」色帶,避免和真實部位搞混。
 */
export function AppShell({
  login,
  active,
  variant = "default",
  children,
}: {
  login?: string;
  active?: string;
  variant?: "default" | "paper";
  children: React.ReactNode;
}) {
  const paper = variant === "paper";
  return (
    <div className={paper ? "min-h-dvh bg-paper-bg" : undefined} data-variant={variant}>
      {paper && <div className="pointer-events-none fixed inset-0 z-30 border-[3px] border-paper" aria-hidden="true" />}
      <div className="mx-auto w-full max-w-[980px] px-4 pb-16">
        <header
          className={`sticky top-0 z-10 -mx-4 mb-4 border-b border-border px-4 py-3 backdrop-blur ${paper ? "bg-paper-bg/90" : "bg-bg/90"}`}
        >
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
                <button
                  type="submit"
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg"
                >
                  登出{login ? ` ${login}` : ""}
                </button>
              </form>
            </div>
          </div>
          <nav className="mt-2 flex gap-4 overflow-x-auto text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active === n.href ? "page" : undefined}
                className={`whitespace-nowrap ${
                  active === n.href ? "border-b-2 border-accent font-bold text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          {paper && (
            <div
              role="note"
              data-testid="paper-band"
              className="-mx-4 mt-3 -mb-3 px-4 py-1.5 text-center text-sm font-bold tracking-wider text-white"
              style={PAPER_STRIPES}
            >
              <span className="rounded bg-black/35 px-2 py-0.5">模擬交易 PAPER · 非真實資金</span>
            </div>
          )}
        </header>
        <main className="flex flex-col gap-[22px]">{children}</main>
      </div>
    </div>
  );
}

export function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
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
