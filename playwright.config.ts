import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 測試:用「測試專用」的假環境變數啟動正式 build(next start),
 * 不需要真的 GitHub OAuth,也不會碰到任何真實 key。
 */
export const TEST_ENV = {
  AUTH_SECRET: "e2e-test-secret-not-real-0123456789abcdef",
  AUTH_GITHUB_ID: "e2e-fake-client-id",
  AUTH_GITHUB_SECRET: "e2e-fake-client-secret",
  ALLOWED_GITHUB_LOGIN: "Yukine1118",
  ALLOWED_GITHUB_ID: "424242",
  AUTH_URL: "http://localhost:3100",
};

/** 只有 3100 有這個假 token。3101 故意不設定,用來鎖「沒 token 就 503」。 */
export const E2E_INGEST_TOKEN = "e2e-ingest-token-not-real";

const executablePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", launchOptions: { executablePath } } },
  ],
  webServer: [
    {
      command: "npm run start -- -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      env: { ...TEST_ENV, INGEST_TOKEN: E2E_INGEST_TOKEN },
      timeout: 120_000,
    },
    {
      // 同一個 build、沒有 INGEST_TOKEN。POST /api/ingest 必須 503。
      command: "npm run start -- -p 3101",
      url: "http://localhost:3101/login",
      reuseExistingServer: false,
      env: { ...TEST_ENV, INGEST_TOKEN: "" },
      timeout: 120_000,
    },
  ],
});
