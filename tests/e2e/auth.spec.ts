import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

// 之後每加一個頁面 / API,就加進這兩個清單
const PAGES = [
  "/",
  "/portfolio/real",
  "/portfolio/paper",
  "/import",
  "/import/history",
  "/import/instructions",
  "/import/history/00000000-0000-0000-0000-000000000000",
  "/does-not-exist",
];
const APIS = ["/api/me", "/api/anything"];

test.describe("未登入", () => {
  for (const path of PAGES) {
    test(`頁面 ${path} 會被導向 /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("button", { name: "用 GitHub 登入" })).toBeVisible();
    });
  }

  for (const path of APIS) {
    test(`API ${path} 回 401 且沒有資料`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    });
  }
});

test.describe("登入後", () => {
  test("允許的帳號可以看到首頁", async ({ page, context }) => {
    await loginAs(context, "Yukine1118", "424242");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI 額度" })).toBeVisible();
    const res = await page.request.get("/api/me");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ login: "Yukine1118" });
  });

  test("其他帳號即使有 session cookie 也被擋", async ({ page, context }) => {
    await loginAs(context, "intruder", "1");
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    const res = await page.request.get("/api/me");
    expect(res.status()).toBe(401);
  });

  test("帳號名稱對但 id 不對也被擋", async ({ page, context }) => {
    await loginAs(context, "Yukine1118", "999");
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("截圖(手動檢查用)", async ({ page, context }, info) => {
    await page.goto("/login");
    await page.screenshot({ path: `screenshots/stage1-login-${info.project.name}.png`, fullPage: true });
    await loginAs(context, "Yukine1118", "424242");
    await page.goto("/");
    await page.screenshot({ path: `screenshots/stage1-home-${info.project.name}.png`, fullPage: true });
  });
});
