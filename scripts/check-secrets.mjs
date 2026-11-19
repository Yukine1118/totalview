#!/usr/bin/env node
/**
 * 掃描「會被 commit 的檔案」裡有沒有看起來像真實 key 的字串。
 * 用法:npm run check:secrets   (發現可疑內容會以非 0 結束)
 * 掃描範圍 = git 已追蹤 + 尚未追蹤但沒被 .gitignore 排除的檔案。
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style key", /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/],
  ["xAI key", /\bxai-[A-Za-z0-9]{30,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["JWT (e.g. Supabase key)", /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
];

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.endsWith("package-lock.json") && f !== "scripts/check-secrets.mjs");

const problems = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binary
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(line)) problems.push(`${file}:${i + 1}  疑似 ${name}`);
    }
  });

  // .env.example 只能有空值(白名單帳號名稱除外)
  if (file === ".env.example") {
    lines.forEach((line, i) => {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && m[2].trim() && m[1] !== "ALLOWED_GITHUB_LOGIN") {
        problems.push(`.env.example:${i + 1}  ${m[1]} 不應該有值`);
      }
    });
  }

  // 任何 .env(除了 .env.example)都不該被 git 看到
  if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith(".env.example")) {
    problems.push(`${file}  .env 檔案不應該進 git(請檢查 .gitignore)`);
  }
}

if (problems.length) {
  console.error("❌ 發現可疑內容:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`✅ 已掃描 ${files.length} 個檔案,沒有發現疑似 key。`);
