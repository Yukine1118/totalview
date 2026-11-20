/**
 * 「預期更新時間」設定檔:決定每種資料多久沒更新算「資料過期」。
 * 想調整門檻,改這個檔案就好,不用動畫面程式。
 *
 * 規則種類:
 * - interval:距離資料時間超過 maxAgeMin 分鐘就過期;超過 warnRatio(預設 0.8)倍先顯示「即將過期」。
 * - tw_close:台股盤後資料。每個交易日 dueHHMM(台北時間)之後,應該要有當天收盤(closeHHMM)之後的資料。
 * - utc_daily:加密貨幣日線。每天 00:00 UTC 收線,收線後 graceHours 小時內應該要有新資料。
 */

export type FreshnessRule =
  | { kind: "interval"; maxAgeMin: number; warnRatio?: number }
  | { kind: "tw_close"; closeHHMM: string; dueHHMM: string }
  | { kind: "utc_daily"; graceHours: number };

const HOUR = 60;

type FreshnessConfig = {
  aiUsage: { auto: FreshnessRule; manual: FreshnessRule };
  realPositions: { TW: FreshnessRule; CRYPTO: FreshnessRule };
  botStatus: { default: FreshnessRule; byBot: Record<string, FreshnessRule> };
  paper: FreshnessRule;
  strategies: FreshnessRule;
  github: FreshnessRule;
};

export const FRESHNESS: FreshnessConfig = {
  /** AI 用量:自動來源每幾分鐘更新;手動來源一天一次 */
  aiUsage: {
    auto: { kind: "interval", maxAgeMin: 15 },
    manual: { kind: "interval", maxAgeMin: 24 * HOUR },
  },

  /** 真實持股:盤後更新 */
  realPositions: {
    TW: { kind: "tw_close", closeHHMM: "13:30", dueHHMM: "18:00" },
    CRYPTO: { kind: "utc_daily", graceHours: 6 },
  },

  /** bot 狀態:依各 bot 的執行頻率。沒列出的 bot 用 default。 */
  botStatus: {
    default: { kind: "interval", maxAgeMin: 26 * HOUR },
    byBot: {
      // 例:每 4 小時跑一次的 bot → { kind: "interval", maxAgeMin: 5 * HOUR }
    },
  },

  /** 模擬交易、策略績效:跟著 bot 跑,預設一天 */
  paper: { kind: "interval", maxAgeMin: 26 * HOUR },
  strategies: { kind: "interval", maxAgeMin: 26 * HOUR },

  /** GitHub 工作進度 */
  github: { kind: "interval", maxAgeMin: 30 },
};

/**
 * 台股休市日(週六日已自動排除,這裡只列平日休市)。格式 YYYY-MM-DD(台北日期)。
 * 請依證交所公告的年度休市表手動維護;沒列到的休市日只會讓「過期」提早出現,不會漏報。
 */
export const TW_MARKET_HOLIDAYS: string[] = [];

export function botStatusRule(bot: string): FreshnessRule {
  return FRESHNESS.botStatus.byBot[bot] ?? FRESHNESS.botStatus.default;
}
