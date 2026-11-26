import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseImport, type ParseResult } from "@/lib/import/parse";
import { parseConfig, type UploadConfig } from "./config";
import { buildReports } from "./map";
import { loadWatermark, remember, watermarkJson } from "./watermark";
import { UploadError, type Io } from "./types";

const diskIo: Io = {
  read: (file) => readFileSync(file, "utf8"),
  exists: (file) => existsSync(file),
};

export type RunOptions = {
  configPath: string;
  dryRun: boolean;
  token?: string;
  fetchImpl?: typeof fetch;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

function issuesText(parsed: ParseResult): string {
  return [
    ...parsed.globalIssues,
    ...parsed.blocks.flatMap((block) => block.issues.map((issue) => `第 ${issue.line} 行 ${issue.path}: ${issue.message}`)),
  ].join("\n");
}

/** 只印狀態與行號,不把伺服器回應裡其他欄位印出來。 */
function briefResponse(status: number, text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `HTTP ${status}`;
  }
  if (!parsed || typeof parsed !== "object") return `HTTP ${status}`;
  const obj = parsed as Record<string, unknown>;
  const brief: Record<string, unknown> = {};
  for (const key of ["ok", "written", "skipped", "error", "issues", "global"]) {
    if (key in obj) brief[key] = obj[key];
  }
  return `HTTP ${status} ${JSON.stringify(brief)}`;
}

function watermarkPath(config: UploadConfig, configDir: string): string {
  return path.resolve(configDir, config.watermark ?? ".aiwr-watermark.json");
}

export async function runUpload(opts: RunOptions): Promise<number> {
  const stdout = opts.stdout ?? ((text) => process.stdout.write(text));
  const stderr = opts.stderr ?? ((text) => process.stderr.write(text));
  try {
    const configPath = path.resolve(opts.configPath);
    const configDir = path.dirname(configPath);
    let raw: unknown;
    try {
      raw = JSON.parse(diskIo.read(configPath).replace(/^\uFEFF/, ""));
    } catch {
      throw new UploadError("設定檔不是合法 JSON");
    }
    const config = parseConfig(raw);
    const wmPath = watermarkPath(config, configDir);
    const wm = loadWatermark(diskIo.exists(wmPath) ? diskIo.read(wmPath) : null);
    const built = buildReports(config, configDir, diskIo, wm);
    for (const warning of built.warnings) stderr(`注意:${warning}\n`);
    const body = JSON.stringify(built.reports, null, 2);
    const parsed = parseImport(body);
    if (!parsed.ok) throw new UploadError(`組成的 JSON 無法通過匯入檢查:\n${issuesText(parsed)}`);

    if (opts.dryRun) {
      stdout(body + "\n");
      stderr("dry-run:沒有送出,水位檔也沒有更新\n");
      return 0;
    }

    const token = opts.token?.trim() ?? "";
    if (!token) throw new UploadError("請設定環境變數 AIWR_INGEST_TOKEN(不要寫進設定檔)");
    if (config.endpoint.includes(token)) throw new UploadError("endpoint 不可以包含 token");

    const fetchImpl = opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await fetchImpl(config.endpoint, {
        method: "POST",
        redirect: "manual",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new UploadError(`送出失敗:${e instanceof Error ? e.message : "連線失敗"}`);
    }
    if (res.status >= 300 && res.status < 400) throw new UploadError(`伺服器回應重新導向(${res.status}),已停止且不跟隨`);
    const text = await res.text();
    if (res.status !== 200) throw new UploadError(`送出沒有成功。${briefResponse(res.status, text)}`);

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(text);
    } catch {
      throw new UploadError("伺服器回應不是 JSON,水位檔沒有更新");
    }
    const obj = responseJson as { ok?: unknown; written?: unknown; skipped?: unknown };
    if (!obj || obj.ok !== true || typeof obj.written !== "number") {
      throw new UploadError("伺服器回應不像成功,水位檔沒有更新");
    }

    const next = remember(wm, built.hashesByBot);
    const tmp = `${wmPath}.tmp`;
    writeFileSync(tmp, watermarkJson(next));
    renameSync(tmp, wmPath);
    stderr(`written=${obj.written} skipped=${typeof obj.skipped === "number" ? obj.skipped : "?"}\n`);
    return 0;
  } catch (e) {
    stderr(`${e instanceof Error ? e.message : "上傳失敗"}\n`);
    return 1;
  }
}
