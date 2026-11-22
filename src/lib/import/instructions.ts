import { BEGIN, END } from "./parse";

/**
 * 「產生 bot 指令」:依 bot 名稱與勾選的區塊,產生可以直接貼進 Grok bot 指令的文字。
 * 純函式;單元測試會確認每一種組合產生的範例都能通過匯入檢查。
 */

export const BLOCKS = [
  { id: "bot_status", label: "bot 狀態", hint: "每次執行的 ok / warn / stop" },
  { id: "summary", label: "摘要", hint: "一段文字重點" },
  { id: "positions_real", label: "真實持股", hint: "真實帳戶的全部持股" },
  { id: "positions_paper", label: "模擬持股", hint: "模擬帳戶的全部持股" },
  { id: "equity", label: "總資產快照", hint: "畫資產曲線用" },
  { id: "trades", label: "交易紀錄", hint: "這次新增的成交" },
  { id: "strategies", label: "策略績效", hint: "報酬、回撤、樣本外" },
  { id: "fx", label: "匯率", hint: "例如 USDT → TWD" },
  { id: "ai_usage", label: "AI 用量", hint: "訂閱額度已用 %" },
] as const;

export type BlockId = (typeof BLOCKS)[number]["id"];

export type InstructionOptions = {
  bot: string;
  blocks: BlockId[];
  /** 真實/模擬帳戶用哪個市場的範例 */
  market: "TW" | "CRYPTO";
};

export function validateBotName(name: string): string | null {
  const n = name.trim();
  if (!n) return "請輸入 bot 名稱";
  if (n.length > 64) return "bot 名稱最多 64 個字";
  if (/["\\\n]/.test(n)) return "bot 名稱不能有雙引號、反斜線或換行";
  return null;
}

const T_RUN = "2026-11-20T14:30:00+08:00";
const T_GEN = "2026-11-20T14:35:00+08:00";

function exampleObject({ bot, blocks, market }: InstructionOptions): Record<string, unknown> {
  const tw = market === "TW";
  const t = tw ? "2026-11-20T13:30:00+08:00" : "2026-11-20T08:00:00+08:00";
  const holding = tw
    ? { market: "TW", symbol: "2330", name: "台積電", qty: 1000, avg_cost: 1020, last_price: 985, currency: "TWD", price_as_of: t }
    : { market: "CRYPTO", symbol: "BTC", qty: 0.12, avg_cost: 61000, last_price: 68250.5, currency: "USDT", price_as_of: t };
  const has = (b: BlockId) => blocks.includes(b);
  // 範例用的帳戶:有勾哪個持股就用哪個;都沒勾就用模擬
  const accounts = [has("positions_real") && "real", has("positions_paper") && "paper"].filter(Boolean) as string[];
  if (accounts.length === 0) accounts.push("paper");
  const o: Record<string, unknown> = { schema: "aiwr/v1", bot: bot.trim(), generated_at: T_GEN };

  if (has("bot_status")) o.bot_status = { status: "ok", last_run_at: T_RUN, note: "這次執行的重點(可省略)", as_of: T_RUN };
  const positions = [];
  if (has("positions_real")) positions.push({ account: "real", as_of: t, items: [holding] });
  if (has("positions_paper")) positions.push({ account: "paper", as_of: t, items: [holding] });
  if (positions.length) o.positions = positions;
  if (has("equity")) {
    o.equity_snapshots = accounts.map((account) => ({
      account,
      market,
      currency: tw ? "TWD" : "USDT",
      equity: tw ? 1265000 : 9990.06,
      cash: tw ? 280000 : 1800,
      as_of: t,
    }));
  }
  if (has("trades")) {
    o.trades = [
      tw
        ? { account: accounts[0], market: "TW", symbol: "2330", side: "buy", qty: 1000, price: 1020, fee: 1453, currency: "TWD", executed_at: "2026-11-20T09:05:00+08:00" }
        : { account: accounts[0], market: "CRYPTO", symbol: "BTC", side: "buy", qty: 0.01, price: 68000, fee: 0.68, currency: "USDT", executed_at: "2026-11-20T09:15:00+08:00" },
    ];
  }
  if (has("strategies")) {
    o.strategies = {
      as_of: T_RUN,
      items: [
        { name: "策略名稱", market: tw ? "台股" : "BTC", return_pct: 18.4, max_drawdown_pct: -12.1, trades: 64, oos_return_pct: null, curve: [100, 101.5, 99.8, 104.2] },
      ],
    };
  }
  if (has("summary")) o.summary = { text: "這次回報的重點摘要。", as_of: T_RUN };
  if (has("fx")) o.fx_rates = [{ base: "USDT", quote: "TWD", rate: 32.1, source: "交易所報價", as_of: t }];
  if (has("ai_usage")) {
    o.ai_usage = [{ service: "Grok Premium", used_pct: 40, reset_at: "2026-11-23T11:00:00+08:00", source: "manual", as_of: T_RUN }];
  }
  return o;
}

const BLOCK_RULES: Record<BlockId, string> = {
  bot_status: '- bot_status:這次執行的狀態。status 只能是 "ok"(正常)、"warn"(注意)、"stop"(停擺)。',
  summary: "- summary:一段文字摘要(1000 字內)。",
  positions_real: '- positions(account "real"):真實帳戶的「全部」持股,不是只列有變動的;空倉寫 "items": []。拿不到現價就填 null。',
  positions_paper: '- positions(account "paper"):模擬帳戶的「全部」持股,不是只列有變動的;空倉寫 "items": []。拿不到現價就填 null。',
  equity: "- equity_snapshots:總資產快照(持股市值 + 現金),每個帳戶、每個幣別一筆。",
  trades: "- trades:只列「這次新增」的成交紀錄。",
  strategies: "- strategies:全部策略的績效;最大回撤寫 0 或負數;樣本外還沒驗證就填 null。",
  fx: "- fx_rates:匯率,例如 1 USDT = 32.1 TWD,要註明來源。",
  ai_usage: '- ai_usage:AI 訂閱用量,service 只能是 "Claude Pro"、"Gemini Pro"、"Grok Premium"、"Google AI Studio"。',
};

export function buildInstruction(opts: InstructionOptions): string {
  const bot = opts.bot.trim();
  const blocks = BLOCKS.map((b) => b.id).filter((id) => opts.blocks.includes(id));
  const json = JSON.stringify(exampleObject({ ...opts, blocks }), null, 2);
  return [
    "【AI 作戰室資料輸出規則】",
    "每次回報的最後,請額外輸出一段機器可讀的 JSON,規則如下:",
    "",
    `1. 第一行單獨寫 ${BEGIN},最後一行單獨寫 ${END},中間只放一個 JSON 物件。`,
    '2. 必須是合法 JSON:欄位名稱和文字都用英文半形雙引號 ",不可以有註解、不可以有結尾多餘的逗號。',
    `3. "schema" 固定是 "aiwr/v1";"bot" 固定是 ${JSON.stringify(bot)}(每次都要一模一樣);"generated_at" 是產生這段 JSON 的時間。`,
    '4. 所有時間都用 ISO 8601 並帶時區,例如 "2026-11-20T14:35:00+08:00"。',
    '5. 數字就是數字:不要加引號、千分位逗號、單位或百分比符號(寫 3000,不要寫 "3,000股";寫 12.5,不要寫 "12.5%")。',
    "6. 絕對不要自己編數字;不知道的值在允許的欄位填 null,或整個區塊不要寫。",
    "7. 每個區塊都要有自己的資料時間(as_of):代表「這份資料是什麼時候的狀態」,不是現在時間。",
    "8. 只寫下面範例裡有的欄位,不要自己加欄位。範例中的數字和時間都只是示範,請換成實際值。",
    "",
    "這個 bot 要輸出的區塊:",
    ...blocks.map((b) => BLOCK_RULES[b]),
    "",
    "格式範例:",
    BEGIN,
    json,
    END,
  ].join("\n");
}

/** 只拿出範例 JSON(含標記),給測試和預覽用 */
export function buildExample(opts: InstructionOptions): string {
  return [BEGIN, JSON.stringify(exampleObject(opts), null, 2), END].join("\n");
}
