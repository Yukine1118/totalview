import { runUpload } from "./lib/run";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`用法: npx tsx scripts/aiwr-upload/cli.ts --config <設定.json> [--dry-run]

讀本機 bot 檔案,編成 aiwr/v1,POST 到網站的 /api/ingest。
Token 放環境變數 AIWR_INGEST_TOKEN,不要寫進設定檔。
--dry-run 只把將送出的 JSON 印到螢幕,不連線、不更新水位檔。`);
  process.exit(0);
}

const configPath = arg("--config") ?? process.env.AIWR_UPLOAD_CONFIG;
if (!configPath || configPath.startsWith("--")) {
  console.error("請用 --config 或環境變數 AIWR_UPLOAD_CONFIG 指定設定檔。");
  process.exit(1);
}

runUpload({
  configPath,
  dryRun: process.argv.includes("--dry-run"),
  token: process.env.AIWR_INGEST_TOKEN,
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : "上傳失敗");
    process.exit(1);
  },
);
