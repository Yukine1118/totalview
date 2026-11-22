import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

const twoBots = readFileSync(path.join(__dirname, "../fixtures/two-bots.txt"), "utf8");

test.describe("匯入頁(未設定資料庫 → 只能檢查格式)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "Yukine1118", "424242");
  });

  test("正確內容:辨識兩個 bot 並顯示預覽", async ({ page }) => {
    await page.goto("/import");
    await page.getByLabel("JSON 資料").fill(twoBots);
    await page.getByRole("button", { name: "檢查格式並預覽" }).click();
    await expect(page.getByText("格式檢查通過,共 2 個 bot")).toBeVisible();
    await expect(page.locator('[data-preview-bot="台股模擬交易室"]')).toContainText("模擬持股");
    await expect(page.locator('[data-preview-bot="幣圈情報員"]')).toContainText("USDT/TWD");
    await expect(page.getByRole("button", { name: "確認匯入" })).toBeDisabled();
    await expect(page.getByText("資料庫尚未設定")).toBeVisible();
  });

  test("錯誤內容:列出第幾行,點一下會選取那一行", async ({ page }) => {
    await page.goto("/import");
    const bad = twoBots.replace('"qty": 3000', '"qty": "3000股"');
    const box = page.getByLabel("JSON 資料");
    await box.fill(bad);
    await page.getByRole("button", { name: "檢查格式並預覽" }).click();
    const errors = page.getByTestId("import-errors");
    await expect(errors).toContainText("第 19 行");
    await expect(errors).toContainText("positions[0].items[0].qty");
    await expect(page.getByRole("button", { name: "確認匯入" })).toHaveCount(0);
    await errors.getByRole("button", { name: /第 19 行/ }).click();
    const selected = await box.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
    expect(selected).toContain('"qty": "3000股"');
  });

  test("修改內容後要重新檢查", async ({ page }) => {
    await page.goto("/import");
    const box = page.getByLabel("JSON 資料");
    await box.fill(twoBots);
    await page.getByRole("button", { name: "檢查格式並預覽" }).click();
    await expect(page.getByText("格式檢查通過")).toBeVisible();
    await box.press("End");
    await box.type(" ");
    await expect(page.getByText("內容已修改,請重新按")).toBeVisible();
  });

  test("歷史頁:未設定資料庫時有提示", async ({ page }) => {
    await page.goto("/import/history");
    await expect(page.getByText("資料庫尚未設定")).toBeVisible();
  });

  test("截圖", async ({ page }, info) => {
    await page.goto("/import");
    await page.getByLabel("JSON 資料").fill(twoBots.replace('"qty": 3000', '"qty": "3000股"').replace("+08:00\",\n  \"bot_status\": { \"status\": \"warn\"", "\",\n  \"bot_status\": { \"status\": \"warn\""));
    await page.getByRole("button", { name: "檢查格式並預覽" }).click();
    await expect(page.getByTestId("import-errors")).toBeVisible();
    await page.screenshot({ path: `screenshots/stage4-import-errors-${info.project.name}.png`, fullPage: true });
    await page.getByLabel("JSON 資料").fill(twoBots);
    await page.getByRole("button", { name: "檢查格式並預覽" }).click();
    await expect(page.getByText("格式檢查通過")).toBeVisible();
    await page.screenshot({ path: `screenshots/stage4-import-preview-${info.project.name}.png`, fullPage: true });
  });
});

test.describe("產生 bot 指令", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "Yukine1118", "424242");
  });

  test("輸入名稱、勾選區塊 → 產生的指令可以直接通過匯入檢查", async ({ page }, info) => {
    await page.goto("/import/instructions");
    await expect(page.getByRole("button", { name: "複製指令" })).toBeDisabled();
    await page.getByLabel("bot 名稱").fill("幣圈情報員");
    await page.getByLabel(/真實持股/).check();
    await page.getByLabel(/匯率/).check();
    await page.getByLabel(/加密貨幣/).check();
    const text = await page.getByLabel("產生的指令").inputValue();
    expect(text).toContain('"bot": "幣圈情報員"');
    expect(text).toContain('"account": "real"');
    expect(text).not.toContain('"strategies"');
    await page.screenshot({ path: `screenshots/stage6-instructions-${info.project.name}.png`, fullPage: true });

    // 把產生的指令貼到匯入頁檢查
    await page.goto("/import");
    await page.getByLabel("JSON 資料").fill(text);
    await page.getByRole("button", { name: "檢查格式並預覽" }).click();
    await expect(page.getByText("格式檢查通過,共 1 個 bot")).toBeVisible();
  });
});

test.describe("手動更新 AI 用量", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "Yukine1118", "424242");
  });

  test("四個服務都有欄位與「去哪裡看」;改數字會自動勾選;未設定資料庫時不能儲存", async ({ page }, info) => {
    await page.goto("/");
    await page.getByRole("link", { name: "手動更新" }).click();
    await expect(page).toHaveURL(/\/import\/usage$/);
    for (const s of ["Claude Pro", "Gemini Pro", "Grok Premium", "Google AI Studio"]) {
      await expect(page.locator(`[data-usage-row="${s}"]`)).toContainText("去哪裡看");
    }
    await page.getByLabel("Claude Pro 已用百分比").fill("42");
    await expect(page.getByRole("button", { name: "更新 1 個服務" })).toBeDisabled(); // 沒有資料庫
    await page.getByLabel("Grok Premium 已用百分比").fill("150");
    await expect(page.getByText("Grok Premium 的已用 % 要是 0–100 的數字")).toBeVisible();
    await page.screenshot({ path: `screenshots/stage7-usage-${info.project.name}.png`, fullPage: true });
  });
});
