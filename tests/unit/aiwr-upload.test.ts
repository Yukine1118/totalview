import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseImport } from "@/lib/import/parse";
import type { Report } from "@/lib/import/schema";
import { parseConfig } from "../../scripts/aiwr-upload/lib/config";
import { parseCsv } from "../../scripts/aiwr-upload/lib/csv";
import { buildReports, mapReportMarkdown, resolveInside } from "../../scripts/aiwr-upload/lib/map";
import { runUpload } from "../../scripts/aiwr-upload/lib/run";
import { parseTime } from "../../scripts/aiwr-upload/lib/time";
import { type Io } from "../../scripts/aiwr-upload/lib/types";
import { emptyWatermark } from "../../scripts/aiwr-upload/lib/watermark";

const demo = path.join(__dirname, "../../scripts/aiwr-upload/fixtures/demo");
const io: Io = {
  read: (file) => readFileSync(file, "utf8"),
  exists: (file) => existsSync(file),
};

function demoConfig(endpoint = "http://127.0.0.1:9/api/ingest") {
  return parseConfig({
    endpoint,
    sources: [
      {
        type: "crypto_paper",
        parent_bot: "模擬交易室",
        root: path.join(demo, "crypto"),
        trades: "trades.csv",
        equity_daily: "equity_daily.csv",
        ohlc_dir: "ohlc",
        ohlc_filename: "{symbol}_1d.csv",
        report: { file: "report.md", summary: { section: "摘要", max_chars: 200 } },
        strategies: [
          { name: "mean_reversion", ledger: "ledger/mean_reversion.json" },
          { name: "flat", ledger: "ledger/flat.json" },
        ],
      },
      {
        type: "tw_paper",
        parent_bot: "台股模擬交易室",
        root: path.join(demo, "tw-paper"),
        positions: "positions.csv",
        equity: "equity.csv",
        trades: "trades.csv",
        strategies: [{ name: "swing" }, { name: "flat" }],
      },
      {
        type: "tw_real",
        bot: "真實持股",
        root: path.join(demo, "tw-real"),
        holdings: "holdings.csv",
        prices_report: "report.md",
        price_table: { heading: "持股六檔收盤（證交所）", symbol: "代號", close: "收盤" },
      },
      {
        type: "report",
        bot: "真實持股",
        file: path.join(demo, "tw-real/report.md"),
        summary: { section: "摘要", max_chars: 80 },
      },
    ],
  });
}

function byBot(reports: Report[], bot: string): Report {
  const found = reports.find((r) => r.bot === bot);
  if (!found) throw new Error(`missing ${bot}`);
  return found;
}

describe("aiwr-upload mappers (DEMO fixtures)", () => {
  it("策略各自一個 bot,父 bot 只有狀態、績效與摘要", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("1999-01-01T00:00:00Z").getTime());
    try {
      const built = buildReports(demoConfig(), demo, io, emptyWatermark());
      const raw = JSON.stringify(built.reports);
      expect(parseImport(raw).ok).toBe(true);
      expect(raw).not.toContain("1999-01-01");
      expect(raw).not.toContain("not-a-real-key");
      expect(raw).not.toContain("DO_NOT_SEND_THIS_BODY");
      expect(raw).not.toContain("SECRET_BODY_SHOULD_NOT_UPLOAD");
      expect(raw).not.toContain("2222");
      expect(raw).not.toContain("1234.5");
      expect(raw).not.toContain("0.4321");
      expect(raw).not.toContain("LEAK");
      expect(raw).not.toContain("8888");
      expect(raw).not.toContain("15000");
      expect(raw).not.toContain("7.77");
      expect(raw).not.toContain("3.33");
      expect(raw).not.toContain('"symbol":"1111"');
      expect(raw).not.toContain('"equity":9999');

      const parent = byBot(built.reports, "模擬交易室");
      expect(Object.keys(parent).sort()).toEqual(["bot", "bot_status", "generated_at", "schema", "strategies", "summary"].sort());
      expect(parent.generated_at).toBe("2026-11-25T08:00:00+08:00");
      expect(parent.bot_status).toMatchObject({
        status: "warn",
        last_run_at: "2026-11-25T08:00:00+08:00",
        as_of: "2026-11-25T00:00:00Z",
        note: "來源狀態:partial",
      });
      expect(parent.summary?.text).toContain("DEMO 摘要");
      expect(parent.summary?.as_of).toBe("2026-11-25T00:00:00Z");

      const sub = byBot(built.reports, "模擬交易室/mean_reversion");
      expect(sub.bot_status).toBeUndefined();
      expect(sub.strategies).toBeUndefined();
      expect(sub.summary).toBeUndefined();
      expect(sub.positions?.[0].as_of).toBe("2026-11-25T00:00:00Z");
      const btc = sub.positions?.[0].items.find((item) => item.symbol === "BTCUSDT");
      const eth = sub.positions?.[0].items.find((item) => item.symbol === "ETHUSDT");
      expect(btc).toMatchObject({ qty: 0.02, avg_cost: 100, last_price: 123, price_as_of: "2026-11-24T00:00:00Z", currency: "USDT" });
      expect(btc?.price_as_of).not.toBe(sub.positions?.[0].as_of);
      expect(eth).toMatchObject({ qty: 1, last_price: null, price_as_of: null, avg_cost: 50 });
      expect(eth).not.toHaveProperty("name");
      const first = sub.equity_snapshots?.[0];
      const last = sub.equity_snapshots?.[sub.equity_snapshots.length - 1];
      expect(first).toMatchObject({ equity: 10000, as_of: "2026-11-22T00:00:00Z" });
      expect(first).not.toHaveProperty("cash");
      expect(last).toMatchObject({ equity: 10500, cash: 1111, as_of: "2026-11-25T00:00:00Z" });
      expect(sub.trades).toHaveLength(2);
      expect(sub.trades?.find((t) => t.side === "buy")).toMatchObject({ fee: 0.1, note: "DEMO buy" });
      expect(sub.trades?.find((t) => t.side === "sell")).not.toHaveProperty("fee");

      const flat = byBot(built.reports, "模擬交易室/flat");
      expect(flat.positions?.[0].items).toEqual([]);
      expect(flat.equity_snapshots).toBeUndefined();
      expect(flat.trades).toBeUndefined();

      const mean = parent.strategies?.items.find((item) => item.name === "mean_reversion");
      const flatItem = parent.strategies?.items.find((item) => item.name === "flat");
      expect(mean).toMatchObject({ return_pct: 5, max_drawdown_pct: -10, trades: 2, oos_return_pct: null });
      expect(mean?.curve).toEqual([10000, 11000, 9900, 10500]);
      expect(flatItem).toMatchObject({ return_pct: null, max_drawdown_pct: null, trades: 0, oos_return_pct: null });
      expect(flatItem).not.toHaveProperty("curve");

      const tw = byBot(built.reports, "台股模擬交易室/swing");
      expect(tw.positions?.[0].as_of).toBe("2026-11-25T13:30:00+08:00");
      expect(tw.positions?.[0].items[0]).toMatchObject({
        symbol: "2330",
        qty: 1000,
        last_price: 12,
        price_as_of: "2026-11-25T13:30:00+08:00",
        avg_cost: 10,
      });
      expect(tw.positions?.[0].items[0]).not.toHaveProperty("name");
      expect(tw.equity_snapshots?.[1]).toMatchObject({ equity: 53000, cash: 41000 });
      expect(tw.trades?.[0]).toMatchObject({ fee: 1.5, price: 10, qty: 1000, note: "DEMO進場" });
      expect(byBot(built.reports, "台股模擬交易室/flat").positions?.[0].items).toEqual([]);
      expect(byBot(built.reports, "台股模擬交易室/flat").positions?.[0].as_of).toBe("2026-11-25T13:30:00+08:00");
      expect(byBot(built.reports, "台股模擬交易室").positions).toBeUndefined();
      expect(byBot(built.reports, "台股模擬交易室").strategies?.items.find((item) => item.name === "swing")?.return_pct).toBe(6);

      const real = byBot(built.reports, "真實持股");
      expect(real.bot_status).toMatchObject({ status: "ok", as_of: "2026-11-25T13:30:00+08:00", last_run_at: "2026-11-25T21:00:00+08:00" });
      expect(real.bot_status).not.toHaveProperty("note");
      expect(real.summary?.text).toBe("DEMO 短摘要只用這段。");
      expect(real.positions?.[0].as_of).toBe("2026-10-01T13:30:00+08:00");
      expect(real.positions?.[0].items).toEqual([
        expect.objectContaining({
          symbol: "9999",
          name: "DEMO股",
          qty: 1000,
          avg_cost: 15,
          last_price: 18,
          price_as_of: "2026-11-25T13:30:00+08:00",
        }),
      ]);

      expect(real.positions?.[0].account).toBe("real");
      expect(real.positions?.[0].as_of).not.toBe(real.positions?.[0].items[0].price_as_of);
      expect(built.warnings.some((w) => w.includes("ETHUSDT"))).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("水位記住的交易不會再送", () => {
    const first = buildReports(demoConfig(), demo, io, emptyWatermark());
    const again = buildReports(demoConfig(), demo, io, { version: 1, sent: first.hashesByBot });
    expect(byBot(again.reports, "模擬交易室/mean_reversion").trades).toBeUndefined();
    expect(byBot(again.reports, "模擬交易室/mean_reversion").positions?.[0].items.length).toBe(2);
  });
});

describe("aiwr-upload 防守", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "aiwr-"));
    dirs.push(dir);
    return dir;
  }

  it("只有日期時,加密貨幣用 00:00 UTC、台股用 13:30 +08", () => {
    expect(parseTime("2026-11-25", "utc_midnight", "UTC")).toBe("2026-11-25T00:00:00Z");
    expect(parseTime("2026-11-25", "tw_close", "Asia/Taipei")).toBe("2026-11-25T13:30:00+08:00");
    expect(parseTime("2026-11-25T08:00:00+08:00", "utc_midnight", "UTC")).toBe("2026-11-25T08:00:00+08:00");
  });

  it("CSV 引號裡的逗號", () => {
    expect(parseCsv('a,b\n"hello, world",x\n')).toEqual([{ a: "hello, world", b: "x" }]);
  });

  it("報告 status 對不到就失敗;data_as_of 不會用 generated_at 填", () => {
    expect(() =>
      mapReportMarkdown("---\nproducer: a\ngenerated_at: 2026-11-20T00:00:00Z\nstatus: ok\n---\n"),
    ).toThrow(/data_as_of/);
    const draft = mapReportMarkdown(
      "---\nproducer: a\ngenerated_at: 2026-11-20T00:00:00Z\ndata_as_of: 2026-11-19T00:00:00Z\nstatus: error\n---\nDEMO\n",
    );
    expect(draft.bot_status).toMatchObject({ status: "stop", note: "來源狀態:error", as_of: "2026-11-19T00:00:00Z", last_run_at: "2026-11-20T00:00:00Z" });
    expect(draft.summary).toBeUndefined();
    expect(() =>
      mapReportMarkdown("---\nproducer: 別人\ngenerated_at: 2026-11-20T00:00:00Z\ndata_as_of: 2026-11-19T00:00:00Z\nstatus: ok\n---\n", "模擬交易室"),
    ).toThrow(/producer/);
  });

  it("設定檔不可以放 token,endpoint 必須是 https", () => {
    expect(() => parseConfig({ token: "x", endpoint: "https://example.com/api/ingest", sources: [{ type: "report", file: "a.md" }] })).toThrow(/密鑰/);
    expect(() => parseConfig({ endpoint: "http://example.com/api/ingest", sources: [{ type: "report", file: "a.md" }] })).toThrow(/https/);
  });

  it("路徑不可以跳出 root", () => {
    expect(() => resolveInside("/tmp/data", "../secret.json")).toThrow(/超出/);
  });

  it("真實持股沒有數量就失敗,不假設 1 股", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "holdings.csv"), "symbol,cost,cost_date\n9999,15,2026-10-01\n");
    const config = parseConfig({
      endpoint: "https://example.com/api/ingest",
      sources: [{ type: "tw_real", bot: "真實持股", root: dir, holdings: "holdings.csv" }],
    });
    expect(() => buildReports(config, dir, io, emptyWatermark())).toThrow(/數量/);
  });

  it("總成本會除以數量;單價欄不會再除一次", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "holdings.csv"), "symbol,qty,cost,cost_date\n1,2,10,2026-11-01\n");
    const total = parseConfig({
      endpoint: "https://example.com/api/ingest",
      sources: [{ type: "tw_real", bot: "真實持股", root: dir, holdings: "holdings.csv", cost_means: "total" }],
    });
    expect(buildReports(total, dir, io, emptyWatermark()).reports[0].positions?.[0].items[0].avg_cost).toBe(5);
    const unit = parseConfig({
      endpoint: "https://example.com/api/ingest",
      sources: [{ type: "tw_real", bot: "真實持股", root: dir, holdings: "holdings.csv", cost_means: "unit" }],
    });
    expect(buildReports(unit, dir, io, emptyWatermark()).reports[0].positions?.[0].items[0].avg_cost).toBe(10);
  });

  it("欄名可以改成中文,成本日和價格日仍然分開", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "positions.csv"), "代號,股數,成本,收盤,成本日,價格日\n8888,10,20,21,2026-11-01,2026-11-20\n");
    const config = parseConfig({
      endpoint: "https://example.com/api/ingest",
      sources: [
        {
          type: "tw_paper",
          parent_bot: "台股",
          root: dir,
          columns: { symbol: "代號", qty: "股數", avg_cost: "成本", last_close: "收盤", date: "成本日", price_date: "價格日" },
          strategies: [{ name: "s", positions: "positions.csv" }],
        },
      ],
    });
    const sub = buildReports(config, dir, io, emptyWatermark()).reports.find((r) => r.bot === "台股/s");
    expect(sub?.positions?.[0].as_of).toBe("2026-11-01T13:30:00+08:00");
    expect(sub?.positions?.[0].items[0]).toMatchObject({ symbol: "8888", qty: 10, avg_cost: 20, last_price: 21, price_as_of: "2026-11-20T13:30:00+08:00" });
    expect(sub?.equity_snapshots).toBeUndefined();
    expect(byBot(buildReports(config, dir, io, emptyWatermark()).reports, "台股").strategies?.items[0].return_pct).toBeNull();
  });
});

describe("runUpload", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function writeConfig(): { dir: string; configPath: string } {
    const dir = mkdtempSync(path.join(tmpdir(), "aiwr-run-"));
    dirs.push(dir);
    const configPath = path.join(dir, "upload.json");
    const config = demoConfig("http://127.0.0.1:9/api/ingest");
    writeFileSync(configPath, JSON.stringify({ ...config, watermark: "wm.json" }));
    return { dir, configPath };
  }

  it("dry-run 印出可匯入的 JSON,不寫水位", async () => {
    const { dir, configPath } = writeConfig();
    let out = "";
    const code = await runUpload({ configPath, dryRun: true, stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    expect(parseImport(out).ok).toBe(true);
    expect(existsSync(path.join(dir, "wm.json"))).toBe(false);
  });

  it("沒有 token 不會送出", async () => {
    const { configPath } = writeConfig();
    const fetchImpl = vi.fn();
    const code = await runUpload({ configPath, dryRun: false, fetchImpl: fetchImpl as unknown as typeof fetch, stderr: () => {} });
    expect(code).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("成功後才更新水位;失敗或回應夾帶其他欄位時不更新、也不印出那些欄位", async () => {
    const { dir, configPath } = writeConfig();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true, written: 4, skipped: 0 }), { status: 200 });
    });
    let err = "";
    const code = await runUpload({
      configPath,
      dryRun: false,
      token: "test-upload-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stderr: (s) => (err += s),
    });
    expect(code).toBe(0);
    expect(err).toContain("written=4");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-upload-token");
    expect(calls[0].url).not.toContain("test-upload-token");
    expect(calls[0].init.redirect).toBe("manual");
    const first = JSON.parse(String(calls[0].init.body)) as Report[];
    expect(byBot(first, "模擬交易室/mean_reversion").trades?.length).toBe(2);
    expect(existsSync(path.join(dir, "wm.json"))).toBe(true);

    calls.length = 0;
    const again = await runUpload({
      configPath,
      dryRun: false,
      token: "test-upload-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stderr: () => {},
    });
    expect(again).toBe(0);
    const second = JSON.parse(String(calls[0].init.body)) as Report[];
    expect(byBot(second, "模擬交易室/mean_reversion").trades).toBeUndefined();

    const badDir = mkdtempSync(path.join(tmpdir(), "aiwr-bad-"));
    dirs.push(badDir);
    const badConfig = path.join(badDir, "upload.json");
    writeFileSync(badConfig, readFileSync(configPath));
    let leaked = "";
    const failed = await runUpload({
      configPath: badConfig,
      dryRun: false,
      token: "test-upload-token",
      fetchImpl: (async () => new Response(JSON.stringify({ error: "invalid", leak: "SECRET_HOLDINGS" }), { status: 500 })) as typeof fetch,
      stderr: (s) => (leaked += s),
    });
    expect(failed).toBe(1);
    expect(leaked).not.toContain("SECRET_HOLDINGS");
    expect(existsSync(path.join(badDir, "wm.json"))).toBe(false);
  });
});
