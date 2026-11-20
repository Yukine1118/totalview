import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("部位頁(DEMO)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "Yukine1118", "424242");
  });

  test("真實頁:沒有模擬色帶,有 REAL 標示與 DEMO 說明", async ({ page }) => {
    await page.goto("/portfolio/real");
    await expect(page.getByRole("heading", { name: "真實部位" })).toBeVisible();
    await expect(page.getByText("REAL 真實資金")).toBeVisible();
    await expect(page.getByTestId("paper-band")).toHaveCount(0);
    await expect(page.locator('[data-variant="default"]')).toHaveCount(1);
    await expect(page.getByRole("note")).toContainText("DEMO");
  });

  test("模擬頁:有斜紋色帶與紫色外框", async ({ page }) => {
    await page.goto("/portfolio/paper");
    await expect(page.getByTestId("paper-band")).toContainText("模擬交易 PAPER");
    await expect(page.locator('[data-variant="paper"]')).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "模擬部位" })).toBeVisible();
  });

  test("真實頁:台股與加密貨幣分開,沒報價顯示無資料,台幣合計有標註匯率來源", async ({ page }) => {
    await page.goto("/portfolio/real");
    await expect(page.locator('[data-currency="TWD"]')).toBeVisible();
    await expect(page.locator('[data-currency="USDT"]')).toBeVisible();
    await expect(page.locator('[data-symbol="ETH"]:visible')).toContainText("無資料");
    await expect(page.locator('[data-currency="USDT"]')).toContainText("沒有現價");
    await expect(page.getByTestId("twd-total")).toContainText("DEMO 匯率");
  });

  test("模擬頁:沒有匯率就不換算", async ({ page }) => {
    await page.goto("/portfolio/paper");
    await expect(page.getByTestId("twd-total")).toContainText("不換算合計");
  });

  test("模擬頁:策略績效表含樣本外欄位", async ({ page }) => {
    await page.goto("/portfolio/paper");
    await expect(page.getByRole("heading", { name: "策略績效" })).toBeVisible();
    await expect(page.locator('[data-strategy="RSI 背離"]:visible')).toContainText("未驗證");
    await expect(page.locator('[data-strategy="Vegas 通道"]:visible')).toContainText("+4.10%");
  });

  test("真實頁沒有策略績效表", async ({ page }) => {
    await page.goto("/portfolio/real");
    await expect(page.getByRole("heading", { name: "策略績效" })).toHaveCount(0);
  });

  test("手機版沒有橫向捲動", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile");
    for (const path of ["/portfolio/real", "/portfolio/paper"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("截圖", async ({ page }, info) => {
    for (const kind of ["real", "paper"]) {
      await page.goto(`/portfolio/${kind}`);
      await page.screenshot({ path: `screenshots/stage3-${kind}-${info.project.name}-light.png`, fullPage: true });
      await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
      await page.screenshot({ path: `screenshots/stage3-${kind}-${info.project.name}-dark.png`, fullPage: true });
    }
  });
});
