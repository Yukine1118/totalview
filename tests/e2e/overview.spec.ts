import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("總覽頁(DEMO)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "Yukine1118", "424242");
  });

  test("三個區塊都在,且標示 DEMO", async ({ page }) => {
    await page.goto("/");
    for (const h of ["AI 額度", "bot 閉環", "工作進度"]) {
      await expect(page.getByRole("heading", { name: h })).toBeVisible();
    }
    await expect(page.getByRole("note")).toContainText("DEMO");
    await expect(page.getByTitle("範例資料,不是真實數字")).toHaveCount(3);
  });

  test("四個 AI 服務卡片,含自動/手動來源", async ({ page }) => {
    await page.goto("/");
    for (const s of ["Claude Pro", "Gemini Pro", "Grok Premium", "Google AI Studio"]) {
      await expect(page.locator(`[data-service="${s}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-service="Google AI Studio"]')).toContainText("自動");
    await expect(page.locator('[data-service="Google AI Studio"]')).toContainText("無資料");
  });

  test("過期與即將過期會被標示", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-service="Grok Premium"] [data-fresh="stale"]')).toContainText("資料過期");
    await expect(page.locator('[data-service="Gemini Pro"] [data-fresh="warn"]')).toContainText("即將過期");
    await expect(page.locator('[data-service="Claude Pro"] [data-fresh="fresh"]')).toBeVisible();
    await expect(page.locator('[data-bot="程式交易"] [data-fresh="stale"]')).toBeVisible();
  });

  test("手機版沒有橫向捲動", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile");
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("截圖:亮色與暗色", async ({ page }, info) => {
    await page.goto("/");
    await page.screenshot({ path: `screenshots/stage2-overview-${info.project.name}-light.png`, fullPage: true });
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await page.screenshot({ path: `screenshots/stage2-overview-${info.project.name}-dark.png`, fullPage: true });
  });
});
