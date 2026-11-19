import { redirect } from "next/navigation";
import { getAllowedSession, signIn } from "@/auth";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  AccessDenied: "這個 GitHub 帳號沒有權限。",
  Configuration: "登入設定有誤(請檢查環境變數)。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getAllowedSession()) redirect("/");
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? "登入失敗,請再試一次。") : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">AI 作戰室</h1>
        <p className="mt-1 text-sm text-muted">僅限授權帳號登入。</p>
        {message && (
          <p role="alert" className="mt-4 rounded-md border border-stop/40 bg-stop/10 px-3 py-2 text-sm text-stop">
            {message}
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:opacity-90"
          >
            用 GitHub 登入
          </button>
        </form>
      </div>
    </main>
  );
}
