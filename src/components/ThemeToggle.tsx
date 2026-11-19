"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const LABEL: Record<Theme, string> = { system: "跟隨系統", light: "亮色", dark: "暗色" };
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg"
      aria-label={`主題:${LABEL[theme]},點擊切換`}
    >
      {LABEL[theme]}
    </button>
  );
}
